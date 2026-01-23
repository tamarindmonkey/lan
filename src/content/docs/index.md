---
title: LAN/Services
description: Home network and self-hosted service documentation
---

# Outline

Home network and self-hosted service documentation

## High-Level Architecture

The network utilizes a **Split-Horizon DNS** strategy hosted on a virtualized microserver. This architecture ensures high-speed, direct local access for LAN clients while securely routing external traffic via a Cloudflare Application Tunnel, effectively bypassing ISP inbound port blocks (80/443) and throttling on specific ports (32400).

- **WAN Ingress:** Cloudflare Tunnel (No inbound ports open).
- **LAN Routing:** Direct IP resolution via local authoritative DNS.
- **Virtualization:** Proxmox VE
    - Privileged LXC for OpenWRT.
    - VM (using all 4 A76 cores) for a docker host to run a monolithic compose with all services.

## Hardware Inventory

### Core Compute & Routing

- **Host Device:** FriendlyARM NanoPC T6
    - **SoC:** Rockchip RK3588
    - **Interfaces:** 2x 2.5Gbps RJ45, NVMe, m.2 WiFi/BT slots
    - Internal Storage
        - 256GB eMMC (/dev/mmcblk0)
        - 256GB Samsung PM961 - PCIe 3.0 x4 m.2 NVME (/dev/nvme0)
    - Exernal/Attached Storage
        - USB 3.0 12TB WD MyBook (/dev/sda1)
    - **OS:** Debian 12 with Pxvirt (Proxmox) 8.4.10
- **Modem:** Motorola MB8611 (DOCSIS 3.1)

### Network Switching Fabric

- **Switch 1 (Living Room):** Mokerlink 8-Port 2.5Gbps Unmanaged (Model: 2G080210GS) with 2x 10Gbps SFP+ Uplinks.
- **Switch 2 (Entertainment Center):** Mokerlink 16-Port 2.5Gbps Unmanaged (Model: 2G16210GS) with 2x 10Gbps SFP+ Uplinks.
- **Switch 3 (Office):** Mokerlink 8-Port 2.5Gbps Unmanaged (Model: 2G080210GS) with 2x 10Gbps SFP+ Uplinks.
- **Switch 4 (Attic):** Mokerlink 5-Port 2.5Gbps Unmanaged (Model: 2G050210GS) with 2x 10Gbps SFP+ Uplinks.
- **Wireless APs:** 2x Ubiquiti Unifi 7 Pro
    - Living Room
    - Office

### Smart Home

- **Controller:** Home Assistant Blue (Odroid N2+)
- **Zigbee Radio:** Sonoff ZBDongle-E (Plus V2)
- **Z-Wave Radio:** Zooz S2 Stick 700 (ZST10 700)

## Virtualization Topology

The NanoPC-T6 (`pmx-t6`) serves as the hypervisor host using two physical interfaces bridged to virtual networks.

| ID | Hostname | OS | Role | Network Configuration |
| --- | --- | --- | --- | --- |
| **Metal** | `pmx-t6` | Debian 12 | **Hypervisor** | `eth0` -> `vmbr0` (WAN Bridge)`eth1` -> `vmbr1` (LAN Bridge) |
| **100** | `openwrt` | OpenWRT 24.10 | **Router / Gateway** | **Privileged LXC** `eth0` (WAN) mapped to `vmbr0` `eth1` (LAN) mapped to `vmbr1` **IP:** `192.168.1.1` |
| **101** | `ubuntu-docker` | Ubuntu 24.04.3 | **Application Host** | **VM** `eth0` mapped to `vmbr1`**IP:** `192.168.1.3` |

## Network Topology & Interconnects

### WAN/ISP Constraints

- **Restrictions:** Inbound ports 21, 80, 143, 443 blocked; Port 32400 throttled.
- **Connection:** Cable Modem -> NanoPC-T6 `eth0` (Passthrough to OpenWRT via `vmbr0`).

### LAN Backbone (2.5G / 10G)

1. **Router Downlink:** NanoPC-T6 `eth1` -> Primary Switch `Port 1` (2.5Gbps).
2. **Switch Interconnects:**
    - **Switch 1 (Living Room)** `Port 2` **↔ Switch 2 (Entertainment Center)** `Port 1` (CAT6)
    - **Switch 1 (Living Room)** `SFP 1` **↔** **Switch 3 (Office)** `SFP 1` (LC/LC OM4).
    - **Switch 1 (Living Room)** `SFP 2` **↔** **Switch 4 (Attic)** `SFP 1` (LC/LC OM4).

### Port Allocations

- **Switch 1:** Uplink, HA Blue, Interconnects.
- **Switch 2:** Entertainment Consoles (Xbox Series X, PS5 Pro, Nintendo Switch, etc.).
- **Switch 3:** Workstations (Mac Mini, Desktops), Lab Equipment (Siglent PSU/Scope).
- **Switch 4:** Cameras (2x Reolink Duo 3v), APs.

## DNS & Routing Architecture

### Split-Horizon Strategy

To prevent hairpin NAT issues and ensure valid SSL termination locally, specific DNS records allow local clients to resolve services directly while external clients use the Cloudflare Tunnel.

### Internal DNS (LAN)

- **Primary:** Pi-hole (Docker on `192.168.1.3`)
- **Configuration:** Both resolvers enforce the local IP for the domain and strip HTTPS/ECH records to prevent SSL handshake failures with Cloudflare keys.
    - **Pi-hole Env:** `FTLCONF_misc_dnsmasq_lines="address=/[FQDN]/192.168.1.3;server=/[FQDN]/"`
    - **OpenWRT Config:** `list address '/[FQDN]/192.168.1.3'`, `list server '/[FQDN]/'`

### External DNS (Cloudflare)

- **Record:** `[FQDN]` (CNAME) → `[Tunnel UUID].cfargotunnel.com`.
    - *Note: Cannot use A record for a tunnel, must be IPv4.*
- **Record:** `*.[FQDN]` (CNAME) → `[Tunnel UUID].cfargotunnel.com`.
- **Record:** `plex.[FQDN]` (A) → `Public IPv4 address of Oracle Cloud Infra VM` (Tailscale tunnel endpoint and Traefik reverse proxy).
- **Proxy Status:** Proxied (Orange Cloud).

## Service Implementation (Docker on `ubuntu-docker`)

### Network Stack

- **Traefik:** Reverse Proxy & Ingress Controller.
    - **Network:** `proxy` bridge (`172.20.0.0/16`).
    - **SSL:** Wildcard `.[FQDN]` via Let’s Encrypt DNS Challenge.
- **Cloudflared:** Tunnel Connector.
    - **Route:** `.[FQDN]` -> `https://traefik:443` (No TLS Verify).
- **Pi-hole:** Network-wide Ad-blocking & DNS.
    - **Network:** Fixed IP `172.20.0.10` on `proxy` net; Host ports `53:53` mapped.

### Media Stack (Plex)

- **Container Network:** `macvlan` (Essential for DLNA/L2 Discovery) and `proxy` (for other services to be able to access by docker internal DNS).
- **ISP Bypass:**
    - **Remote Access:** Disabled in GUI to prevent UPnP/Port 32400 mapping.
    - **Custom Server URL:** Set to `https://plex.[FQDN]:443`.
    - **Routing:** Traefik labels on `ubuntu-docker` configured to proxy traffic to `http://192.168.1.5:32400`.
    - **Tunnel:** Tailscale VPN connection between 192.168.1.5 and public IPv4 of OCI VM (endpoint).
        - Restrictive to exposing **only** one IP using `TS_EXTRA_ARGS=--advertise-routes=192.168.1.5/32 --accept-routes`
    - External Traefik reverse proxy on OCI VM translates `http://192.168.1.5:32400` to `https://[OCI VM Public IPv4]:443/`
    - **DNS A Record:** `plex.[FQDN]` handles resolution to `[OCI VM Public IPv4]`
    - **Result:** External traffic routes via `https://plex.[FQDN]` (Tunnel), bypassing ISP throttling. Internal traffic routes to 192.168.1.5. Avoids breaking ToS of Cloudflare Application Tunnel (free tier).

### Authentication

**Authentik:** Identity Provider (IdP) and SSO.

- Rule in place to check for Cloudflare headers in request. If present, client is external and must authenticate.
- No authentication required from LAN clients.

### Docker compose

Monolithic docker compose for all services.
- See [docker-compose](docker-compose)

## Client-Side Specifics

### Browser VPN Extensions

- **Configuration:** “Split Tunneling” or “Bypass List” must be configured in the extension to avoid external resolution via Cloudflare Application Tunnel.
    - **Bypass Rule 1:** `192.168.1.0/24` (Local Subnet)
    - **Bypass Rule 2:** `.[FQDN]` (Local Domain)

### Home Assistant

- **Connectivity:** Hardwired via Primary Switch `Port 3`.
- **Zigbee:** Sonoff ZBDongle-E (Plus V2) connected via USB extension.
- **Z-Wave:** Zooz S2 Stick 700 (ZST10 700) connected via USB extension.
