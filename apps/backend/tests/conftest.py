import sys
import os

# Add backend app src directory to PYTHONPATH for pytest discovery
backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'app'))
sys.path.append(backend_root)
