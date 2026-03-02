import paramiko

host = '72.61.80.21'
user = 'root'
password = 'DanielaVeit25?'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print("Connecting to VPS...")
    ssh.connect(host, username=user, password=password)
    print("Connected. Running Docker command...")
    
    # Check if container is already running and remove it if needed, then start
    cmd = '''
    docker rm -f redaktionsplaner-db || true
    docker run -d --name redaktionsplaner-db \
        -e POSTGRES_USER=healthrise \
        -e POSTGRES_PASSWORD=password \
        -e POSTGRES_DB=redaktionsplaner \
        -p 5432:5432 \
        -v postgres-data:/var/lib/postgresql/data \
        --restart always \
        postgres:16-alpine
    '''
    
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    out = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    
    print("STDOUT:", out)
    print("STDERR:", err)
    
finally:
    ssh.close()
    print("Disconnected.")
