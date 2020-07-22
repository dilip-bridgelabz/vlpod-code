# test_sagews_timing.py
# tests of sage worksheet that measure test duration

# at present I don't see a pytest api feature for this
# other than --duration flag which is experimental and
# for profiling only
from __future__ import absolute_import
import pytest
import socket
import conftest
import os
import time
import signal


class TestSageTiming:
    r"""
    These tests are to validate the test framework. They do not
    run sage_server.
    """
    def test_basic_timing(self):
        start = time.time()
        result = os.system('sleep 1')
        assert result == 0
        tick = time.time()
        elapsed = tick - start
        assert 1.0 == pytest.approx(elapsed, abs=0.2)

    def test_load_sage(self):
        start = time.time()
        # maybe put first load into fixture
        result = os.system("echo '2+2' | sage -python")
        assert result == 0
        tick = time.time()
        elapsed = tick - start
        print(("elapsed 1: %s" % elapsed))
        # second load after things are cached
        start = time.time()
        result = os.system("echo '2+2' | sage -python")
        assert result == 0
        tick = time.time()
        elapsed = tick - start
        print(("elapsed 2: %s" % elapsed))
        assert elapsed < 4.0

    def test_import_sage_server(self):
        start = time.time()
        # sage 9.0: previously, this was setting the path to import from the global /cocalc/... location
        # now, it's using the code here
        code = ';'.join([
            "import sys",
            "sys.path.insert(0, '.')",
            "import sage_server"
        ])
        result = os.system("echo \"{}\" | sage -python".format(code))
        assert result == 0
        tick = time.time()
        elapsed = tick - start
        print(("elapsed %s" % elapsed))
        assert elapsed < 20.0


class TestStartSageServer:
    def test_2plus2_timing(self, test_id):
        import sys

        # if sage_server is running, stop it
        os.system("smc-sage-server stop")

        # start the clock
        start = time.time()

        # start a new sage_server process
        os.system(conftest.start_cmd())
        print(("sage_server start time %s sec" % (time.time() - start)))
        # add pause here because sometimes the log file isn't ready immediately
        time.sleep(0.5)

        # setup connection to sage_server TCP listener
        host, port = conftest.get_sage_server_info()
        print(("host %s  port %s" % (host, port)))

        # multiple tries at connecting because there's a delay between
        # writing the port number and listening on the socket for connections
        for attempt in range(10):
            attempt += 1
            print(("attempt %s" % attempt))
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.connect((host, port))
                break
            except:
                print((sys.exc_info()[0]))
                pass
            time.sleep(0.5)
        else:
            pytest.fail("Could not connect to sage_server at port %s" % port)
        print("connected to socket")

        # unlock
        conftest.client_unlock_connection(sock)
        print("socket unlocked")
        conn = conftest.ConnectionJSON(sock)
        c_ack = conn._recv(1)
        assert c_ack == b'y', "expect ack for token, got %s" % c_ack

        # start session
        msg = conftest.message.start_session()
        msg['type'] = 'sage'
        conn.send_json(msg)
        print("start_session sent")
        typ, mesg = conn.recv()
        assert typ == 'json'
        pid = mesg['pid']
        print(("sage_server PID = %s" % pid))

        code = "2+2\n"
        output = "4\n"

        m = conftest.message.execute_code(code=code, id=test_id)
        m['preparse'] = True

        # send block of code to be executed
        conn.send_json(m)

        # check stdout
        typ, mesg = conn.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert mesg['stdout'] == output
        elapsed = time.time() - start

        # teardown connection
        conn.send_json(conftest.message.terminate_session())
        print("\nExiting Sage client.")
        # wait 3 sec for process to die, then kill it
        for loop_count in range(6):
            try:
                os.kill(pid, 0)
            except OSError:
                pass
            time.sleep(0.5)
        else:
            print(("sending sigterm to %s" % pid))
            os.kill(pid, signal.SIGTERM)

        # check timing
        print(("elapsed 2+2 %s" % elapsed))
        assert elapsed < 25.0

        return
