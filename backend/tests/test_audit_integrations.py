"""Bundled exercise catalog completeness and mandatory credits."""
import json
import re
from pathlib import Path

def test_all_execution_figures_have_specific_pt_instructions_and_assets():
    frontend=Path(__file__).parents[2]/'frontend'
    registry=(frontend/'src/data/exercise-art.ts').read_text(encoding='utf8')
    keys=re.findall(r'^  "([^"]+)":',registry,re.M)
    guides=json.loads((frontend/'src/data/exercise-instructions-pt.json').read_text(encoding='utf8'))
    assert len(keys)==76 and len(set(keys))==76 and set(keys)==set(guides)
    for guide in guides.values():
        assert all(len(guide[key])>25 for key in ['start','movement','breathing','care'])
    files=re.findall(r'require\("(.+?)"\)',registry)
    assert all((frontend/'src/data'/p).is_file() for p in files)
    viewer=(frontend/'src/components/exercise-visuals.tsx').read_text(encoding='utf8')
    assert 'Imagem gerada por IA' not in viewer and 'por IA' not in viewer
    assert 'CC BY-SA 3.0' in viewer and 'Everkinetic' in viewer
