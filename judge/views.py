from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.db import IntegrityError
from .models import Problem, Submission, UserProfile
from .serializers import ProblemSerializer, SubmissionSerializer
import os
from google import genai as genai_client
from google.genai import types as genai_types
from .tasks import evaluate_submission
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q


client = genai_client.Client(api_key=os.getenv("GEMINI_API_KEY"))


# ─── Helper: get or create UserProfile safely ────────────────────────────────
def get_or_create_profile(user):
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={'ai_debugs_remaining': 5}
    )
    return profile


# ─── Auth: Register ───────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        email = request.data.get('email', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if len(password) < 6:
            return Response(
                {'error': 'Password must be at least 6 characters.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )
        except IntegrityError:
            return Response(
                {'error': 'Username already taken.'},
                status=status.HTTP_409_CONFLICT
            )

        # Create profile immediately
        get_or_create_profile(user)

        # Return tokens so user is logged in right after registering
        refresh = RefreshToken.for_user(user)
        return Response({
            'access':   str(refresh.access_token),
            'refresh':  str(refresh),
            'user': {
                'id':       user.id,
                'username': user.username,
                'email':    user.email,
            }
        }, status=status.HTTP_201_CREATED)


# ─── Auth: Login ──────────────────────────────────────────────────────────────
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = authenticate(username=username, password=password)
        if user is None:
            return Response(
                {'error': 'Invalid username or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        profile = get_or_create_profile(user)
        refresh = RefreshToken.for_user(user)

        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id':                  user.id,
                'username':            user.username,
                'email':               user.email,
                'ai_debugs_remaining': profile.ai_debugs_remaining,
            }
        })


# ─── Auth: Logout (blacklist refresh token) ───────────────────────────────────
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass  # Token already invalid — that's fine
        return Response({'message': 'Logged out.'}, status=status.HTTP_200_OK)


# ─── Auth: Current user info ──────────────────────────────────────────────────
class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = get_or_create_profile(request.user)
        return Response({
            'id':                  request.user.id,
            'username':            request.user.username,
            'email':               request.user.email,
            'ai_debugs_remaining': profile.ai_debugs_remaining,
        })


# ─── Problems ─────────────────────────────────────────────────────────────────
class ProblemPagination(PageNumberPagination):
    page_size = 25  # Number of problems per load
    page_size_query_param = 'page_size'


class ProblemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Problem.objects.all()
    serializer_class = ProblemSerializer
    permission_classes = [AllowAny]
    pagination_class = ProblemPagination

    def get_queryset(self):
        queryset = Problem.objects.all().order_by('id')
        difficulty = self.request.query_params.get('difficulty')
        search = self.request.query_params.get('search')
        company = self.request.query_params.get('company')

        if difficulty and difficulty != 'ALL':
            queryset = queryset.filter(difficulty=difficulty)

        if search:
            # Tip: Searching only in title is much faster for 1800+ rows
            queryset = queryset.filter(title__icontains=search)

        if company:
            # Ensure your JSONField is indexed in Postgres for this to be fast
            queryset = queryset.filter(companies__contains=[company])

        return queryset


# ─── Submissions ──────────────────────────────────────────────────────────────
class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        """Each user only sees their own submissions. Unauthenticated gets nothing."""
        if self.request.user.is_authenticated:
            return Submission.objects.filter(
                user=self.request.user
            ).select_related('problem', 'user').order_by('-submitted_at')
        return Submission.objects.none()

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            user = self.request.user
        else:
            user = User.objects.get(id=1)

        submission = serializer.save(user=user)
        print(
            f"----> PREPARING TO SEND TASK FOR SUBMISSION {submission.id}", flush=True)
        evaluate_submission.delay(submission.id)
        print(
            f"----> TASK {submission.id} SUCCESSFULLY SENT TO REDIS!", flush=True)


# ─── Submission Status (public, poll-safe) ────────────────────────────────────
class SubmissionStatusView(APIView):
    """
    Lightweight poll endpoint — returns only status + execution_time for a
    given submission ID. No auth required so the frontend can always poll.
    Only exposes non-sensitive fields (no code, no user data).
    """
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            s = Submission.objects.get(pk=pk)
        except Submission.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id':             s.id,
            'status':         s.status,
            'execution_time': s.execution_time,
            'problem':        s.problem_id,
            'language':       s.language,
            'submitted_at':   s.submitted_at,
        })


# ─── AI Code Review ───────────────────────────────────────────────────────────
class CodeReviewAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile = get_or_create_profile(request.user)

        if profile.ai_debugs_remaining <= 0:
            return Response(
                {'error': 'You have exhausted your AI debugging quota for today.'},
                status=status.HTTP_403_FORBIDDEN
            )

        code = request.data.get('code')
        problem_id = request.data.get('problem_id')
        error_msg = request.data.get(
            'error_message', 'No specific error, just logical review.')

        if not code or not problem_id:
            return Response(
                {'error': 'Code and Problem ID are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            problem = Problem.objects.get(id=problem_id)
        except Problem.DoesNotExist:
            return Response({'error': 'Problem not found.'}, status=status.HTTP_404_NOT_FOUND)

        prompt = f"""
        You are an expert strict programming judge and mentor.
        Review the following code for the problem: "{problem.title}".
        Problem Description: {problem.description}

        User's Code:
        {code}

        User's Error/Context: {error_msg}

        Provide a very brief hint or point out the logical flaw/syntax error.
        DO NOT provide the full correct code. Give them a nudge in the right direction.
        """

        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt
            )

            profile.ai_debugs_remaining -= 1
            profile.save()

            return Response({
                'review':            response.text,
                'debugs_remaining':  profile.ai_debugs_remaining,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
