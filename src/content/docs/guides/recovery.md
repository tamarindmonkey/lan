---
title: Recover
description: Recovery process
---

# Recovery

## OCI A1 Instance Recovery

Configure a fresh OCI A1 Ubuntu instance to a fully operational Plex ingress node.

### Set hostname and prevent cloud-init overrides

```bash
read -p "Enter new hostname: " NEW_HOSTNAME
CURRENT_HOSTNAME=$(hostname)
sudo hostnamectl set-hostname "$NEW_HOSTNAME"
sudo sed -i "s/$CURRENT_HOSTNAME/$NEW_HOSTNAME/g" /etc/hosts
sudo sed -i 's/preserve_hostname: false/preserve_hostname: true/g' /etc/cloud/cloud.cfg
```

### Install Docker and other requirements

Remove any existing Docker components

```bash
DOCKER_PKGS=$(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc 2>/dev/null | grep -w "install" | cut -f1)

if [ -n "$DOCKER_PKGS" ]; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get remove -y $DOCKER_PKGS
else
    echo "No conflicting Docker packages found. Skipping removal."
fi
```

Install basic requirements

```bash
PACKAGES=(
    "ca-certificates"
    "curl"
    "iptables-persistent"
    "vim"
    "unzip"
    "zip"
)

sudo apt update
for pkg in "${PACKAGES[@]}"; do
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" || echo "Warning: Failed to install $pkg, moving to next..."
done
```

Add Docker's official GPG key

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

Add Docker's repository to Apt sources

```bash
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

Install Docker

```bash
PACKAGES=(
    "docker-ce"
    "docker-ce-cli"
    "containerd.io"
    "docker-buildx-plugin"
    "docker-compose-plugin"
)

sudo apt update
for pkg in "${PACKAGES[@]}"; do
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg" || echo "Warning: Failed to install $pkg, moving to next..."
done
```

Confirm install, start docker

```bash
sudo systemctl status docker
sudo systemctl start docker
```

Update user/groups

```bash
sudo groupadd docker
sudo usermod -aG docker $USER
newgrp docker
```

Confirm user access

```bash
docker run hello-world
```

### Restore critical files

Transfer your backup files (plex-ingress-core.zip) to the host and unzip

```bash
unzip plex-ingress-core.zip
```

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

Persist across reboots

```bash
sudo netfilter-persistent save
```

### Start the stack

```bash
cd ~/plex-ingress
docker compose up -d
```
