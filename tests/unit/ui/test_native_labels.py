from dodaios.ui.native_labels import desktop_label, state_label


def test_russian_native_labels():
    assert desktop_label("Open", "Открыть", lang="ru") == "Открыть"
    assert state_label("listening", lang="ru") == "Слушаю"


def test_english_native_labels():
    assert desktop_label("Open", "Открыть", lang="en") == "Open"
    assert state_label("listening", lang="en") == "listening"
