from rest_framework import serializers
from .models import Problem, TestCases, Submission


class ProblemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Problem
        fields = [
            'id', 'title', 'description', 'difficulty', 'is_premium', 
            'asked_by_faang', 'companies', 'related_topics', 
            'acceptance_rate', 'likes', 'dislikes', 'templates'
        ]

class TestCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestCases
        # To not expose expected_output for hidden cases
        fields = ['id', 'input_data', 'is_hidden']


class SubmissionSerializer(serializers.ModelSerializer):
    problem_title = serializers.CharField(source='problem.title', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Submission
        fields = [
            'id', 'user', 'username',
            'problem', 'problem_title',
            'code', 'language',
            'status', 'execution_time', 'submitted_at'
        ]
        read_only_fields = ['user', 'username', 'status', 'execution_time', 'submitted_at', 'problem_title']