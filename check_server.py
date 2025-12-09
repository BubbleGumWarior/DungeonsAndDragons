#!/usr/bin/env python3
"""
Server Health Check Script
Checks if the D&D server is running and accessible
"""

import socket
import ssl
import requests
import subprocess
import sys
from datetime import datetime

# Configuration
DOMAIN = "dungeonlair.ddns.net"
LOCAL_IP = "192.168.50.214"
PORT_HTTPS = 443
PORT_DEV = 5000

# Disable SSL warnings for self-signed certificates
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def print_section(title):
    """Print a formatted section header"""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)

def check_node_process():
    """Check if Node.js process is running"""
    print_section("Node.js Process Check")
    try:
        result = subprocess.run(
            ["powershell", "-Command", "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object Id, CPU, WorkingSet"],
            capture_output=True,
            text=True
        )
        if result.stdout.strip() and "Id" in result.stdout:
            print("✅ Node.js is RUNNING")
            print(result.stdout)
            return True
        else:
            print("❌ Node.js is NOT running")
            return False
    except Exception as e:
        print(f"❌ Error checking process: {e}")
        return False

def check_port_listening(port):
    """Check if a port is listening"""
    print(f"\nChecking if port {port} is listening...")
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object LocalAddress, State"],
            capture_output=True,
            text=True
        )
        if result.stdout.strip() and "Listen" in result.stdout:
            print(f"✅ Port {port} is LISTENING")
            print(result.stdout)
            return True
        else:
            print(f"❌ Port {port} is NOT listening")
            return False
    except Exception as e:
        print(f"❌ Error checking port: {e}")
        return False

def check_local_http(port):
    """Check HTTP/HTTPS response on localhost"""
    print(f"\nTesting localhost on port {port}...")
    protocol = "https" if port == 443 else "http"
    url = f"{protocol}://localhost:{port}/api/health"
    
    try:
        response = requests.get(url, verify=False, timeout=5)
        if response.status_code == 200:
            print(f"✅ Server responds on {url}")
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"⚠️  Server responded with status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Cannot connect to {url}")
        print(f"   Error: {e}")
        return False

def check_local_ip_access(ip, port):
    """Check access via local IP"""
    print(f"\nTesting local IP {ip}:{port}...")
    protocol = "https" if port == 443 else "http"
    url = f"{protocol}://{ip}:{port}/api/health"
    
    try:
        response = requests.get(url, verify=False, timeout=5)
        if response.status_code == 200:
            print(f"✅ Server accessible at {url}")
            return True
        else:
            print(f"⚠️  Server responded with status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Cannot connect via local IP")
        print(f"   Error: {e}")
        return False

def check_domain_access(domain, port):
    """Check access via domain name"""
    print(f"\nTesting domain {domain}:{port}...")
    protocol = "https" if port == 443 else "http"
    port_str = f":{port}" if port != 443 else ""
    url = f"{protocol}://{domain}{port_str}/api/health"
    
    try:
        response = requests.get(url, verify=False, timeout=10)
        if response.status_code == 200:
            print(f"✅ Server accessible at {url}")
            print(f"   Response: {response.json()}")
            return True
        else:
            print(f"⚠️  Server responded with status {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Cannot connect via domain")
        print(f"   Error: {e}")
        return False

def check_dns_resolution(domain):
    """Check if domain resolves to correct IP"""
    print_section("DNS Resolution Check")
    try:
        ip = socket.gethostbyname(domain)
        print(f"✅ {domain} resolves to {ip}")
        return ip
    except socket.gaierror as e:
        print(f"❌ DNS resolution failed: {e}")
        return None

def check_port_open(host, port):
    """Check if a port is open and accepting connections"""
    print(f"\nChecking if {host}:{port} accepts connections...")
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex((host, port))
        sock.close()
        
        if result == 0:
            print(f"✅ Port {port} is OPEN on {host}")
            return True
        else:
            print(f"❌ Port {port} is CLOSED on {host}")
            return False
    except Exception as e:
        print(f"❌ Error checking port: {e}")
        return False

def check_ssl_certificate(domain, port=443):
    """Check SSL certificate details"""
    print_section("SSL Certificate Check")
    try:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        with socket.create_connection((domain, port), timeout=10) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                print(f"✅ SSL certificate retrieved")
                print(f"   Subject: {dict(x[0] for x in cert['subject'])}")
                print(f"   Issuer: {dict(x[0] for x in cert['issuer'])}")
                print(f"   Valid until: {cert['notAfter']}")
                return True
    except Exception as e:
        print(f"❌ SSL certificate check failed: {e}")
        return False

def check_firewall_rule(port):
    """Check Windows Firewall rules for the port"""
    print(f"\nChecking Windows Firewall for port {port}...")
    try:
        result = subprocess.run(
            ["powershell", "-Command", f"Get-NetFirewallRule | Where-Object {{$_.DisplayName -like '*{port}*' -or $_.DisplayName -like '*Node*' -or $_.DisplayName -like '*HTTPS*'}} | Select-Object DisplayName, Enabled, Direction, Action"],
            capture_output=True,
            text=True
        )
        if result.stdout.strip():
            print("Firewall rules found:")
            print(result.stdout)
        else:
            print("⚠️  No specific firewall rules found for this port")
    except Exception as e:
        print(f"❌ Error checking firewall: {e}")

def main():
    """Run all checks"""
    print("\n" + "█"*70)
    print("  D&D SERVER HEALTH CHECK")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("█"*70)
    
    # Check Node.js process
    node_running = check_node_process()
    
    # Check ports
    print_section("Port Status Check")
    port_443_listening = check_port_listening(443)
    port_5000_listening = check_port_listening(5000)
    
    # Check localhost access
    print_section("Localhost Connectivity")
    if port_443_listening:
        check_local_http(443)
    if port_5000_listening:
        check_local_http(5000)
    
    # Check local IP access
    print_section("Local IP Connectivity")
    if port_443_listening:
        check_local_ip_access(LOCAL_IP, 443)
    if port_5000_listening:
        check_local_ip_access(LOCAL_IP, 5000)
    
    # Check DNS
    resolved_ip = check_dns_resolution(DOMAIN)
    
    # Check port accessibility from outside
    print_section("External Port Accessibility")
    if resolved_ip:
        check_port_open(resolved_ip, 443)
        check_port_open(resolved_ip, 5000)
    
    # Check domain access
    print_section("Domain Accessibility")
    check_domain_access(DOMAIN, 443)
    
    # Check SSL certificate
    if port_443_listening:
        check_ssl_certificate(DOMAIN)
    
    # Check firewall
    print_section("Firewall Check")
    check_firewall_rule(443)
    check_firewall_rule(5000)
    
    # Summary
    print_section("SUMMARY")
    print(f"Node.js Running: {'✅ YES' if node_running else '❌ NO'}")
    print(f"Port 443 Listening: {'✅ YES' if port_443_listening else '❌ NO'}")
    print(f"Port 5000 Listening: {'✅ YES' if port_5000_listening else '❌ NO'}")
    
    if not node_running:
        print("\n⚠️  SERVER IS NOT RUNNING!")
        print("Start the server with: node server.js (as Administrator)")
    elif not port_443_listening and not port_5000_listening:
        print("\n⚠️  Server is running but not listening on expected ports")
    else:
        print("\n✅ Server appears to be running")
    
    print("\n" + "="*70 + "\n")

if __name__ == "__main__":
    main()
