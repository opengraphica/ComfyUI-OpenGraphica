"""
@author: OpenGraphica devs
@title: ComfyUI-OpenGraphica
@nickname: ComfyUI-OpenGraphica
@description: Edit images in the OpenGraphica editor directly within ComfyUI.
"""
from pathlib import Path
import server

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

PLUGIN_DIR = Path(__file__).resolve().parent
EDITOR_DIST = PLUGIN_DIR / "node_modules" / "opengraphica" / "dist" / "esm"

server.PromptServer.instance.routes.static(
    "/opengraphica",
    path=str(EDITOR_DIST),
)

WEB_DIRECTORY = "js"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']