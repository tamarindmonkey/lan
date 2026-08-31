---
title: Recover
description: Recovery process
---

# Recovery

## OCI A1 Instance Recovery

Configure from fresh OCI A1 Ubuntu instance to a fully operational Plex ingress node.

### Harden Container Permissions

The containers require strict permissions on sensitive files. Configure file permissions first.

```bash
sudo chown -R ubuntu:ubuntu ~/plex-ingress
chmod 600 ~/plex-ingress/traefik/acme.json
chmod 700 ~/plex-ingress/tailscale
chmod 600 ~/plex-ingress/tailscale/tailscaled.state
```

### Prevent race condition

dockerproxy has to bind to the Tailscale IP before the tailscale0 interface is fully provisioned.

You must allow non-local binds (disabled by default).

```bash
sudo sysctl -w net.ipv4.ip_nonlocal_bind=1
echo "net.ipv4.ip_nonlocal_bind=1" | sudo tee -a /etc/sysctl.conf
```

### Configure the Ubuntu Firewall

OCI's Ubuntu images contain a default REJECT rule at the bottom of the INPUT chain. 

Insert the Traefik and Tailscale ports at the very top (INPUT 1) to bypass it.

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 1 -p udp --dport 42485 -j ACCEPT
```

Then install iptables-persistent to keep it configured across reboots.

```bash
sudo apt-get update
sudo apt-get install iptables-persistent -y
sudo netfilter-persistent save
```

### Start the stack

```bash
cd ~/plex-ingress
docker compose up -d
```
