"""LLM actions are checked before the frontend offers confirmation."""

from app.api.chat import (
    _gentle_toner_fallback,
    _is_sensitisation_ui_test_request,
    _is_toner_creation_request,
    _parse_actions,
    _sensitisation_ui_test_fallback,
    _unsupported_action_ingredients,
)


def test_detects_extracts_in_created_formula():
    answer = """จัดให้ค่ะ
<action>[{"type":"create_formula","name":"toner","items":[
{"name":"Witch Hazel","smiles":"fake","concentration":10},
{"name":"Aloe Vera","smiles":"fake","concentration":5},
{"name":"Glycerin","smiles":"OCC(O)CO","concentration":5}
]}]</action>"""

    assert _unsupported_action_ingredients(answer) == ["Witch Hazel", "Aloe Vera"]


def test_toner_fallback_is_executable_and_totals_100_percent():
    answer = _gentle_toner_fallback("สร้าง node โทนเนอร์อ่อนโยนให้หน่อย")

    assert answer is not None
    assert not _unsupported_action_ingredients(answer)
    actions = _parse_actions(answer)
    assert [action["type"] for action in actions] == ["create_formula", "goto"]
    items = actions[0]["items"]
    assert sum(item["concentration"] for item in items) == 100
    assert all(item["smiles"] and item["name"] for item in items)
    assert actions[1] == {"type": "goto", "tab": "nodes"}


def test_only_creation_intent_uses_reviewed_toner_template():
    assert _is_toner_creation_request("สร้างโทนเนอร์เช็ดหน้าแบบปลอดภัยให้หน่อย")
    assert _is_toner_creation_request("make a gentle toner")
    assert not _is_toner_creation_request("ทำไมโทนเนอร์สูตรนี้คะแนนสูง")


def test_detects_explicit_high_sensitisation_ui_test_intent():
    assert _is_sensitisation_ui_test_request(
        "ฉันต้องการสูตรที่แพ้ผิวหนัง 50++ เพื่อทดสอบการแสดงผล"
    )
    assert _is_sensitisation_ui_test_request("make a skin sensitization 60 demo")
    assert not _is_sensitisation_ui_test_request("ทำไมคะแนนแพ้ผิวหนังเป็น 50")
    assert not _is_sensitisation_ui_test_request("ทดสอบการแพ้ผิวหนังระดับต่ำ 20")


def test_high_sensitisation_ui_fixture_is_reviewed_and_totals_100_percent():
    answer = _sensitisation_ui_test_fallback(
        "ฉันต้องการสูตรที่แพ้ผิวหนัง 50++ เพื่อทดสอบการแสดงผล"
    )

    assert answer is not None
    assert "ห้ามผลิตหรือใช้กับผิว" in answer
    actions = _parse_actions(answer)
    assert [action["type"] for action in actions] == ["create_formula"]
    assert actions[0]["name"] == "TEST ONLY — แพ้ผิวหนัง 50+"
    items = actions[0]["items"]
    assert sum(item["concentration"] for item in items) == 100
    assert items[1] == {
        "name": "Cinnamaldehyde",
        "smiles": "O=C/C=C/c1ccccc1",
        "concentration": 65.0,
    }
