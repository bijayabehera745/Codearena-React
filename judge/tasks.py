import docker
import time
import os
import base64
from celery import shared_task
from requests.exceptions import ReadTimeout
from .models import Submission


# ─────────────────────────────────────────────────────────────────────────────
# INPUT TYPE SYSTEM
# ─────────────────────────────────────────────────────────────────────────────

def build_python_wrapper(input_type):
    parse_lines = {
        'two_ints':
            'args=inp.strip().split(); '
            'result=Solution().solve(int(args[0]),int(args[1]))',
        'int':
            'result=Solution().solve(int(inp.strip()))',
        'array_int':
            'result=Solution().solve(list(map(int,inp.strip().split())))',
        'array_target':
            'lines=inp.strip().split("\\n"); '
            'result=Solution().solve(list(map(int,lines[0].split())),int(lines[1].strip()))',
        'two_arrays':
            'lines=inp.strip().split("\\n"); '
            'result=Solution().solve(list(map(int,lines[0].split())),list(map(int,lines[1].split())))',
        'string':
            'result=Solution().solve(inp.strip())',
    }
    parse_line = parse_lines.get(input_type, parse_lines['two_ints'])
    lines = [
        'import sys, os, traceback',
        'try:',
        '    inp = os.environ.get("TEST_INPUT", "")',
        '    g = {}',
        '    exec(os.environ.get("USER_CODE", ""), g)',
        '    Solution = g["Solution"]',
        f'    {parse_line}',
        '    if isinstance(result, list):',
        '        print(" ".join(map(str, result)))',
        '    else:',
        '        print(result)',
        'except Exception:',
        '    traceback.print_exc()',
        '    sys.exit(1)',
    ]
    return '\n'.join(lines)


CPP_HEADERS = """\
#include <bits/stdc++.h>
using namespace std;

"""

CPP_MAINS = {
    'two_ints': """\
int main(){
    int a, b;
    cin >> a >> b;
    cout << Solution().solve(a, b) << endl;
    return 0;
}""",
    'int': """\
int main(){
    int n;
    cin >> n;
    cout << Solution().solve(n) << endl;
    return 0;
}""",
    'array_int': """\
int main(){
    vector<int> nums;
    int x;
    while(cin >> x) nums.push_back(x);
    Solution sol;
    cout << sol.solve(nums) << endl;
    return 0;
}""",
    'array_target': """\
int main(){
    string line1, line2;
    getline(cin, line1);
    getline(cin, line2);
    istringstream ss(line1);
    vector<int> nums;
    int x;
    while(ss >> x) nums.push_back(x);
    int target = stoi(line2);
    cout << Solution().solve(nums, target) << endl;
    return 0;
}""",
    'two_arrays': """\
int main(){
    string line1, line2;
    getline(cin, line1);
    getline(cin, line2);
    istringstream ss1(line1), ss2(line2);
    vector<int> a, b;
    int x;
    while(ss1 >> x) a.push_back(x);
    while(ss2 >> x) b.push_back(x);
    cout << Solution().solve(a, b) << endl;
    return 0;
}""",
    'string': """\
int main(){
    string s;
    getline(cin, s);
    cout << Solution().solve(s) << endl;
    return 0;
}""",
}

JAVA_MAINS = {
    'two_ints': """\
import java.util.Scanner;
public class Main{
    public static void main(String[] a){
        Scanner sc=new Scanner(System.in);
        int x=sc.nextInt(), y=sc.nextInt();
        System.out.println(new Solution().solve(x,y));
    }
}""",
    'int': """\
import java.util.Scanner;
public class Main{
    public static void main(String[] a){
        Scanner sc=new Scanner(System.in);
        System.out.println(new Solution().solve(sc.nextInt()));
    }
}""",
    'array_int': """\
import java.util.*;
public class Main{
    public static void main(String[] a){
        Scanner sc=new Scanner(System.in);
        List<Integer> list=new ArrayList<>();
        while(sc.hasNextInt()) list.add(sc.nextInt());
        int[] nums=list.stream().mapToInt(i->i).toArray();
        Object r=new Solution().solve(nums);
        if(r instanceof int[]){
            int[] arr=(int[])r;
            StringBuilder sb=new StringBuilder();
            for(int i=0;i<arr.length;i++){if(i>0)sb.append(" ");sb.append(arr[i]);}
            System.out.println(sb);
        } else { System.out.println(r); }
    }
}""",
    'array_target': """\
import java.util.*;
public class Main{
    public static void main(String[] a) throws Exception{
        java.io.BufferedReader br=new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        String[] p=br.readLine().trim().split("\\\\s+");
        int target=Integer.parseInt(br.readLine().trim());
        int[] nums=Arrays.stream(p).mapToInt(Integer::parseInt).toArray();
        System.out.println(new Solution().solve(nums,target));
    }
}""",
    'two_arrays': """\
import java.util.*;
public class Main{
    public static void main(String[] a) throws Exception{
        java.io.BufferedReader br=new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
        int[] x=Arrays.stream(br.readLine().trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
        int[] y=Arrays.stream(br.readLine().trim().split("\\\\s+")).mapToInt(Integer::parseInt).toArray();
        System.out.println(new Solution().solve(x,y));
    }
}""",
    'string': """\
import java.util.Scanner;
public class Main{
    public static void main(String[] a){
        Scanner sc=new Scanner(System.in);
        System.out.println(new Solution().solve(sc.nextLine()));
    }
}""",
}


def b64(text):
    """Base64-encode text so it survives shell quoting perfectly."""
    return base64.b64encode(text.encode('utf-8')).decode('ascii')


def format_stdin(input_data, input_type):
    if input_type in ('array_target', 'two_arrays'):
        return input_data.replace('|', '\n').strip()
    return input_data.strip()


@shared_task
def evaluate_submission(submission_id):
    client = docker.from_env()

    try:
        submission = Submission.objects.select_related('problem').get(id=submission_id)
        problem    = submission.problem
        test_cases = problem.test_cases.all()
        input_type = problem.input_type
    except Submission.DoesNotExist:
        return 'Submission not found'

    lang          = submission.language
    final_status  = 'A'
    max_exec_time = 0.0

    for tc in test_cases:
        container = None
        try:
            stdin_data = format_stdin(tc.input_data, input_type)
            start_time = time.time()

            # PYTHON
            if lang == 'python':
                image   = 'python:3.10-slim'
                wrapper = build_python_wrapper(input_type)
                env     = {
                    'USER_CODE':  submission.code,
                    'TEST_INPUT': stdin_data,
                }
                command = ['python', '-c', wrapper]

            # C++
            # Strategy: base64-encode the full .cpp source and pass it as an
            # env var. Inside the container, a tiny Python3-free shell pipeline
            # decodes it: `base64 -d` is available in every Linux image.
            # No file mounting needed — zero Docker Desktop compatibility issues.
            elif lang == 'cpp':
                image     = 'gcc:latest'
                main_fn   = CPP_MAINS.get(input_type, CPP_MAINS['two_ints'])
                full_code = CPP_HEADERS + submission.code.strip() + '\n\n' + main_fn
                code_b64  = b64(full_code)
                env = {
                    'CODE_B64':   code_b64,
                    'TEST_INPUT': stdin_data,
                }
                # base64 -d decodes the source, writes it, then compiles
                command = [
                    'sh', '-c',
                    'echo "$CODE_B64" | base64 -d > /tmp/main.cpp && '
                    'g++ -std=c++17 /tmp/main.cpp -O2 -o /tmp/main || exit 255; '
                    'printf "%s" "$TEST_INPUT" | /tmp/main'
                ]

            # JAVA
            elif lang == 'java':
                image     = 'amazoncorretto:17-alpine'
                main_cls  = JAVA_MAINS.get(input_type, JAVA_MAINS['two_ints'])
                full_code = submission.code.strip() + '\n\n' + main_cls
                code_b64  = b64(full_code)
                env = {
                    'CODE_B64':   code_b64,
                    'TEST_INPUT': stdin_data,
                }
                command = [
                    'sh', '-c',
                    'printf "%s" "$CODE_B64" | base64 -d > /tmp/Main.java && '
                    'javac /tmp/Main.java -d /tmp || exit 255; '
                    'printf "%s" "$TEST_INPUT" | java -cp /tmp Main'
                ]

            else:
                final_status = 'CE'
                break

            # RUN SANDBOX
            container = client.containers.run(
                image,
                command=command,
                environment=env,
                detach=True,
                mem_limit=f'{problem.memory_limit}m',
                network_disabled=True,
            )

            result        = container.wait(timeout=problem.time_limit + 15)
            elapsed       = time.time() - start_time
            max_exec_time = max(max_exec_time, elapsed)

            logs      = container.logs(stdout=True, stderr=True).decode('utf-8').strip()
            container.remove(force=True)
            container = None

            if result['StatusCode'] == 255:
                print(f'----> CE:\n{logs}', flush=True)
                final_status = 'CE'
                break
            elif result['StatusCode'] != 0:
                print(f'----> RE:\n{logs}', flush=True)
                final_status = 'RE'
                break

            user_out     = logs.replace('\r', '').strip()
            expected_out = tc.expected_output.replace('\r', '').strip()

            print(f'----> TC got={repr(user_out)} want={repr(expected_out)}', flush=True)

            if user_out != expected_out:
                final_status = 'WA'
                break

        except ReadTimeout:
            if container:
                container.remove(force=True)
            final_status = 'TLE'
            break

        except Exception as e:
            print(f'----> EXCEPTION: {e}', flush=True)
            if container:
                container.remove(force=True)
            final_status = 'RE'
            break

    submission.status         = final_status
    submission.execution_time = round(max_exec_time, 3)
    submission.save()

    return f'Evaluated {submission_id} → {final_status}'