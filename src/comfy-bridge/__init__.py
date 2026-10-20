# blombo-bridge: lets BlomboUI open its workflows in this ComfyUI and save them back.
# It adds no nodes; ComfyUI serves ./web and loads web/blombo.js in the browser (ADR-0009).
# BlomboUI copies this folder into custom_nodes/ of the ComfyUIs it manages and keeps it current.

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
