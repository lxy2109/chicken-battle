from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent / "art" / "optimize-textures.py"), run_name="__main__")