from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent / "gen" / "gen-app-icon.py"), run_name="__main__")