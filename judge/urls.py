from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    ProblemViewSet,
    SubmissionViewSet,
    CodeReviewAPIView,
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    SubmissionStatusView,
)

router = DefaultRouter()
router.register(r'problems',    ProblemViewSet, basename='problem')
router.register(r'submissions', SubmissionViewSet, basename='submission')

urlpatterns = [
    path('', include(router.urls)),

    # Auth
    path('auth/register/', RegisterView.as_view(),      name='register'),
    path('auth/login/',    LoginView.as_view(),          name='login'),
    path('auth/logout/',   LogoutView.as_view(),         name='logout'),
    path('auth/refresh/',  TokenRefreshView.as_view(),   name='token_refresh'),
    path('auth/me/',       MeView.as_view(),             name='me'),

    # Submission status poll (no auth needed)
    path('submissions/<int:pk>/status/', SubmissionStatusView.as_view(), name='submission-status'),

    # AI review
    path('ai-review/',     CodeReviewAPIView.as_view(),  name='ai-review'),
]