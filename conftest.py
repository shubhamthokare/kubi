# Root-level pytest configuration to set PYTHONPATH for all apps
import sys, os

# Add backend app directory to PYTHONPATH for pytest discovery
backend_app_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), 'apps', 'backend', 'app')
)
if backend_app_path not in sys.path:
    sys.path.append(backend_app_path)

agent_app_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), 'apps', 'agent')
)
if os.path.isdir(agent_app_path) and agent_app_path not in sys.path:
    sys.path.append(agent_app_path)
if os.path.isdir(agent_app_path) and agent_app_path not in sys.path:
    sys.path.append(agent_app_path)
