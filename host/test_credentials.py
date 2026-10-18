import os
from pathlib import Path
import stat
import unittest
from unittest.mock import patch
from common import private_file, Rejected


class CredentialTests(unittest.TestCase):
    def check_file(self, mode, uid=0, gid=0, directory='/run/credentials/calendar.service',
                   path='/run/credentials/calendar.service/token'):
        info = os.stat_result((stat.S_IFREG | mode, 0, 0, 1, uid, gid, 64, 0, 0, 0))
        with patch.dict(os.environ, {'CREDENTIALS_DIRECTORY':directory}), patch.object(Path,'stat',return_value=info):
            return private_file(path)

    def test_service_acl_layout_and_private_file(self):
        self.check_file(0o440)
        self.check_file(0o600, uid=1001, gid=1001, path='/other/private')

    def test_rejects_broad_or_wrong_directory_group_access(self):
        for mode, uid, gid, path in [(0o444,0,0,'/run/credentials/calendar.service/token'),
                                    (0o460,0,0,'/run/credentials/calendar.service/token'),
                                    (0o440,0,982,'/run/credentials/calendar.service/token'),
                                    (0o440,1001,0,'/run/credentials/calendar.service/token'),
                                    (0o440,0,0,'/other/token')]:
            with self.assertRaises(Rejected):
                self.check_file(mode,uid,gid,path=path)
