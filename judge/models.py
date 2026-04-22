from django.db import models
from django.contrib.auth.models import User


class Problem(models.Model):
    DIFFICULTY_CHOICES = [
        ('E', 'Easy'),
        ('M', 'Medium'),
        ('H', 'Hard'),
    ]

    # Tells the judge HOW to parse the test case input and call the solution
    INPUT_TYPE_CHOICES = [
        ('two_ints',      'Two Integers (a, b)'),
        ('array_int',     'Array of Integers'),
        ('two_arrays',    'Two Arrays of Integers'),
        ('string',        'Single String'),
        ('int',           'Single Integer'),
        ('array_target',  'Array + Target Integer'),
    ]

    title            = models.CharField(max_length=200, db_index=True)
    description      = models.TextField()
    difficulty       = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    time_limit       = models.FloatField(default=1.0)
    memory_limit     = models.IntegerField(default=256)
    input_type       = models.CharField(max_length=30, choices=INPUT_TYPE_CHOICES, default='two_ints')
    
    is_premium      = models.BooleanField(default=False)
    asked_by_faang  = models.BooleanField(default=False)
    
    # Store companies as a list: ["Google", "Amazon", "Microsoft"]
    companies       = models.JSONField(default=list, blank=True, null=True)
    
    # Store topics as a list: ["Array", "Hash Table", "Binary Search"]
    related_topics  = models.JSONField(default=list, blank=True, null=True)
    
    # Stats from the Kaggle dataset
    acceptance_rate = models.FloatField(default=0.0)
    likes           = models.IntegerField(default=0)
    dislikes        = models.IntegerField(default=0)
    # NEW: Store multi-language templates
    # Expected format: {"python": "...", "cpp": "...", "java": "..."}
    templates        = models.JSONField(
        default=dict, 
        blank=True, 
        help_text="Dictionary of language-specific boilerplates",
        null=True
    )
    
    # Keep this for backward compatibility or as a default Python fallback
    boilerplate_code = models.TextField(blank=True)

    def __str__(self):
        return self.title


class TestCases(models.Model):
    problem         = models.ForeignKey(Problem, related_name='test_cases', on_delete=models.CASCADE)
    input_data      = models.TextField(help_text="Raw input matching the problem's input_type")
    expected_output = models.TextField()
    is_hidden       = models.BooleanField(default=True)

    def __str__(self):
        return f"Test Case for {self.problem.title}"


class Submission(models.Model):
    STATUS_CHOICES = [
        ('P',   'Pending'),
        ('A',   'Accepted'),
        ('WA',  'Wrong Answer'),
        ('TLE', 'Time Limit Exceeded'),
        ('CE',  'Compilation Error'),
        ('RE',  'Runtime Error'),
    ]

    user           = models.ForeignKey(User, on_delete=models.CASCADE)
    problem        = models.ForeignKey(Problem, on_delete=models.CASCADE)
    code           = models.TextField()
    language       = models.CharField(max_length=50, default='python')
    status         = models.CharField(max_length=30, choices=STATUS_CHOICES, default='P')
    execution_time = models.FloatField(null=True, blank=True)
    submitted_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.user.username} - {self.problem.title} - {self.status}"


class UserProfile(models.Model):
    user                  = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    ai_debugs_remaining   = models.IntegerField(default=5)

    def __str__(self):
        return f"{self.user.username}'s Profile"