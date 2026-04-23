import time
from locust import HttpUser, task, between

class CodeArenaUser(HttpUser):
    # Simulate realistic user thinking time between arriving and submitting (1 to 3 seconds)
    wait_time = between(1, 3)

    @task
    def submit_and_poll_two_sum(self):
        # The Two Sum C++ solution you provided
        cpp_code = """class Solution {
public:
    string solve(vector<int>& nums, int target) {
        unordered_map<int, int> mp; // value -> index

        for (int i = 0; i < nums.size(); i++) {
            int complement = target - nums[i];

            // check if complement exists
            if (mp.find(complement) != mp.end()) {
                return to_string(mp[complement]) + " " + to_string(i);
            }

            mp[nums[i]] = i;
        }

        return "-1 -1"; // if no solution
    }
};"""
        
        # Matches the exact JSON body from WorkspacePage.jsx handleSubmit()
        payload = {
            "problem": 1, 
            "language": "cpp",
            "code": cpp_code
        }
        
        headers = {"Content-Type": "application/json"}

        # 1. Fire the initial POST request to submit the code
        with self.client.post("/api/submissions/", json=payload, headers=headers, catch_response=True) as submit_response:
            # Handle rate limiting (429) gracefully without crashing the test
            if submit_response.status_code == 429:
                submit_response.failure("Rate Limited by AnonRateThrottle")
                return
            
            if submit_response.status_code not in (200, 201):
                submit_response.failure(f"Submission failed with status {submit_response.status_code}")
                return 
            
            data = submit_response.json()
            submission_id = data.get("id")
            
            if not submission_id:
                submit_response.failure("API did not return a submission ID")
                return

        # 2. Begin the Polling Loop (Mimicking the setInterval in React)
        max_attempts = 60  # Matching your frontend's MAX_ATTEMPTS
        attempts = 0
        status = "P" # Default pending status used by your backend

        while status in ("P", "Pending") and attempts < max_attempts:
            # Wait 1.5 seconds exactly like the frontend timer
            time.sleep(1.5) 
            
            # Using the /status/ endpoint defined in your React pollSubmission function
            endpoint = f"/api/submissions/{submission_id}/status/"
            
            # Use 'name' to group all polling requests into a single row in the Locust UI
            with self.client.get(endpoint, name="/api/submissions/[id]/status/", catch_response=True) as poll_response:
                if poll_response.status_code == 200:
                    poll_data = poll_response.json()
                    status = poll_data.get("status", "P")
                    
                    # If status is no longer Pending, the judge has finished
                    if status not in ("P", "Pending"):
                        # 1. Print directly to your terminal running Locust
                        print(f"--> Submission {submission_id} finished! Verdict: {status}")
                        
                        # 2. Fire a custom event to show up in the Locust Web UI!
                        self.environment.events.request.fire(
                            request_type="VERDICT",
                            name=f"Judge Result: {status}",
                            response_time=0,  # We only care about the count here
                            response_length=0,
                            exception=None
                        )
                        
                        poll_response.success()
                        break
            
            attempts += 1

        # 3. Handle Droplet Queue Timeouts
        if status in ("P", "Pending"):
            # If we exit the loop after 90 seconds (60 attempts * 1.5s) and it's still Pending, 
            # your Celery workers are overwhelmed. Flag this as a timeout in the UI.
            self.environment.events.request.fire(
                request_type="GET",
                name="/api/submissions/[id]/status/ (TIMEOUT)",
                response_time=0,
                response_length=0,
                exception=Exception("Task stuck in Pending for > 90 seconds")
            )