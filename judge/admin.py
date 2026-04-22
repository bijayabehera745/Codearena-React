from django.contrib import admin
from .models import Problem, TestCases, Submission, UserProfile

# Registering the Problem model
@admin.register(Problem)
class ProblemAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'difficulty', 'time_limit', 'memory_limit')
    search_fields = ('title',)
    list_filter = ('difficulty',)

# Registering the TestCases model
@admin.register(TestCases)
class TestCasesAdmin(admin.ModelAdmin):
    list_display = ('id', 'problem', 'is_hidden')
    list_filter = ('is_hidden', 'problem')

# Registering the Submission model
@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'problem', 'status', 'language', 'execution_time', 'submitted_at')
    list_filter = ('status', 'language', 'problem')
    search_fields = ('user__username', 'problem__title')

# Registering the UserProfile model
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'ai_debugs_remaining')