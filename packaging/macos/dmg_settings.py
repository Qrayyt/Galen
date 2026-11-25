import os
application = defines["app"]
files = [application]
symlinks = {"Applications": "/Applications"}
format = "UDZO"
background = defines["background"]
icon_locations = {"Galen.app": (200, 214), "Applications": (440, 214)}
window_rect = ((150, 150), (640, 400))
default_view = "icon-view"
icon_size = 104
text_size = 12
show_status_bar = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
show_tab_view = False
hide_extensions = ["Galen.app"]
