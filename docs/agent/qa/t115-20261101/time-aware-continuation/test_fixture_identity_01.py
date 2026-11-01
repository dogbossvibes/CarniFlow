import unittest, runpy
from pathlib import Path
m=runpy.run_path(str(Path(__file__).with_name("t115-fixture-identity-01.py")))
class Identity(unittest.TestCase):
    def setUp(self):
        self.e={"id":"fixed", "owner_id":"owner", "dog_id":"dog", "appointment_at":"2026-11-01T15:00:00Z", "reason":"T115 synthetic QA only", "status":"completed"}
    def test_equivalent_utc_offset_fraction(self):
        for stamp in ["2026-11-01T15:00:00+00:00","2026-11-01T16:00:00+01:00","2026-11-01T15:00:00.000000Z"]:
            self.assertTrue(m["matches"]("dog_vet_appointments",self.e,{**self.e,"appointment_at":stamp}))
    def test_different_instants_rejected(self):
        for stamp in ["2026-11-01T15:00:01Z","2026-11-01T15:00:00.000001Z","2026-11-01T15:00:00+01:00"]:
            self.assertFalse(m["matches"]("dog_vet_appointments",self.e,{**self.e,"appointment_at":stamp}))
    def test_invalid_naive_or_malformed_rejected(self):
        for stamp in [None,False,0,"2026-11-01T15:00:00","2026-11-01 15:00:00Z","2026-11-01T15:00Z","2026-11-01T15:00:00+99:00","2026-11-01T15:00:00Z ","2026-02-30T15:00:00Z","2026-11-01T16:00:00+00:60","2026-11-01T17:39:00+01:99","2026-11-01T14:00:00-00:60","2026-11-01T15:00:00+24:00"]:
            self.assertFalse(m["matches"]("dog_vet_appointments",self.e,{**self.e,"appointment_at":stamp}))
    def test_every_identity_or_content_change_rejected(self):
        for field in self.e:
            self.assertFalse(m["matches"]("dog_vet_appointments",self.e,{**self.e,field:"wrong"}))
            value=self.e.copy();del value[field]
            self.assertFalse(m["matches"]("dog_vet_appointments",self.e,value))
    def test_time_normalization_is_specific_to_table_and_field(self):
        self.assertFalse(m["matches"]("other",self.e,{**self.e,"appointment_at":"2026-11-01T15:00:00+00:00"}))
        self.assertFalse(m["matches"]("dog_vet_appointments",self.e,{**self.e,"reason":"2026-11-01T15:00:00+00:00"}))
    def test_server_extra_columns_permitted_no_mutation(self):
        a={**self.e,"created_at":"server-generated"};before=a.copy()
        self.assertTrue(m["matches"]("dog_vet_appointments",self.e,a));self.assertEqual(a,before)
    def test_boolean_numeric_alias_rejected(self):
        self.assertFalse(m["matches"]("meds",{**self.e,"is_active":False},{**self.e,"is_active":0}))
    def test_invalid_or_unbound_expected_scope_rejected(self):
        for bad in [None,[],{}, {**self.e,"owner_id":""},{**self.e,"dog_id":None}]:
            self.assertFalse(m["matches"]("dog_vet_appointments",bad,self.e))
