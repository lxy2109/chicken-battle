from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent / "import" / "import-official-split.py"), run_name="__main__")