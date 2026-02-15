# 📚 Audiobookshelf Library Tidy

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-compatible-red.svg)](https://www.raspberrypi.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Self-hosted web app to organize your Audiobookshelf library. Access from **any device** including Android!

## ✨ Features

- 📱 **Mobile-friendly** - Works on phones, tablets, and desktops
- 🐳 **One-command install** - Just docker-compose up!
- 📂 **Network share support** - Works with SMB/NFS
- ⚙️ **Configurable** - Choose folder structure and file naming
- 📊 **Statistics** - View library stats before organizing
- 👀 **Preview changes** - See what will happen before applying
- 🔄 **Safe** - Only moves/renames files, never deletes

## 🚀 Quick Start (For Users)

### Prerequisites

- Docker and Docker Compose installed
- Audiobook library accessible (local or mounted network share)

### Installation

1. **Create a `docker-compose.yml` file:**

```yaml
version: '3.8'

services:
  audiobookshelf-tidy:
    image: yourusername/audiobookshelf-tidy:latest
    container_name: audiobookshelf-tidy
    ports:
      - "3000:3000"
    volumes:
      # Change this to your audiobook library path
      - /mnt/audiobooks:/library
    restart: unless-stopped
```

2. **Start the container:**

```bash
docker-compose up -d
```

3. **Access the web UI:**

Open your browser and go to:
```
http://localhost:3000
```

Or from another device on your network:
```
http://YOUR_SERVER_IP:3000
```

That's it! 🎉

## 📱 Usage

1. **Enter Library Path**: Type `/library` (this is the mounted path inside the container)
2. **Configure Format**: Choose your preferred folder structure and file naming
3. **Scan Library**: View statistics about your collection
4. **Preview Changes**: See exactly what will be reorganized
5. **Apply Changes**: Click to reorganize your library!

## 📂 Mounting Your Library

### Local Directory

If your audiobooks are stored locally:

```yaml
volumes:
  - /home/pi/audiobooks:/library
  - /mnt/usbdrive/audiobooks:/library
  - /media/audiobooks:/library
```

### Network Share (SMB/CIFS)

First, mount the network share on your host:

```bash
# Install cifs-utils
sudo apt-get install cifs-utils

# Create mount point
sudo mkdir -p /mnt/audiobooks

# Mount the share
sudo mount -t cifs //192.168.1.100/audiobooks /mnt/audiobooks \
  -o username=YOUR_USERNAME,password=YOUR_PASSWORD

# Make it permanent (add to /etc/fstab)
echo "//192.168.1.100/audiobooks /mnt/audiobooks cifs username=YOUR_USERNAME,password=YOUR_PASSWORD,uid=1000,gid=1000 0 0" | sudo tee -a /etc/fstab
```

Then use in docker-compose.yml:

```yaml
volumes:
  - /mnt/audiobooks:/library
```

### Network Share (NFS)

```bash
# Install nfs-common
sudo apt-get install nfs-common

# Create mount point
sudo mkdir -p /mnt/audiobooks

# Mount the share
sudo mount -t nfs 192.168.1.100:/volume1/audiobooks /mnt/audiobooks

# Make it permanent (add to /etc/fstab)
echo "192.168.1.100:/volume1/audiobooks /mnt/audiobooks nfs defaults 0 0" | sudo tee -a /etc/fstab
```

## 🎨 Organization Formats

### Folder Structure Options

**Author / Series / Book** (Recommended for series)
```
Brandon Sanderson/
  Mistborn/
    01 The Final Empire/
    02 The Well of Ascension/
    03 The Hero of Ages/
```

**Author / Book** (Simpler structure)
```
Brandon Sanderson/
  The Final Empire/
  The Well of Ascension/
  The Hero of Ages/
```

### File Naming Options

**Full Details** (Most information)
```
Brandon Sanderson - Mistborn 01 - The Final Empire - 01.mp3
Brandon Sanderson - Mistborn 01 - The Final Empire - 02.mp3
```

**Title Only** (Cleaner)
```
The Final Empire - 01.mp3
The Final Empire - 02.mp3
```

**Keep Original Names** (Only reorganize folders)
```
[Original filenames preserved]
```

## 🔧 Advanced Configuration

### Change Port

```yaml
ports:
  - "8080:3000"  # Access on port 8080 instead
```

### Multiple Libraries

Run multiple instances for different libraries:

```yaml
version: '3.8'

services:
  audiobooks-fiction:
    image: yourusername/audiobookshelf-tidy:latest
    container_name: tidy-fiction
    ports:
      - "3001:3000"
    volumes:
      - /mnt/fiction:/library
    restart: unless-stopped

  audiobooks-nonfiction:
    image: yourusername/audiobookshelf-tidy:latest
    container_name: tidy-nonfiction
    ports:
      - "3002:3000"
    volumes:
      - /mnt/nonfiction:/library
    restart: unless-stopped
```

## 🛠️ Management Commands

```bash
# View logs
docker-compose logs -f audiobookshelf-tidy

# Stop the container
docker-compose down

# Restart the container
docker-compose restart

# Update to latest version
docker-compose pull
docker-compose up -d

# Remove container (keeps your library intact)
docker-compose down
```

## 📱 Accessing from Mobile Devices

1. Make sure your device is on the same network
2. Find your server's IP address: `hostname -I`
3. Open browser on your phone/tablet
4. Go to: `http://YOUR_SERVER_IP:3000`

Works perfectly on Android, iOS, tablets, etc!

## ❓ Troubleshooting

### Can't access the web UI

```bash
# Check if container is running
docker ps

# Check container logs
docker-compose logs

# Get your server IP
hostname -I
```

### Permission errors

The container needs read/write access to your library:

```bash
# Check folder ownership
ls -la /mnt/audiobooks

# Fix permissions if needed
sudo chown -R 1000:1000 /mnt/audiobooks
```

### Library path not found

```bash
# Verify mount inside container
docker exec audiobookshelf-tidy ls -la /library

# Check docker-compose.yml volume mapping
```

### Changes not applying

- Ensure you entered `/library` as the path in the web UI
- Check that the container has write permissions
- View logs: `docker-compose logs -f`

## 🔒 Security Notes

- Designed for local network use
- Do not expose port 3000 to the internet without authentication
- The app has full read/write access to the mounted library
- **Always backup your library before making changes!**

## 📋 Requirements

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 1.29 or higher
- **Disk Space**: Minimal (~50MB for the container)
- **RAM**: ~100MB while running
- **Platform**: Tested on Raspberry Pi 4, but works on any Linux system with Docker

## 🏗️ Building from Source

If you want to build the image yourself instead of using the pre-built one:

```bash
git clone https://github.com/yourusername/audiobookshelf-tidy.git
cd audiobookshelf-tidy
docker-compose build
docker-compose up -d
```

## 📝 License

MIT License - Feel free to use, modify, and distribute!

## 🤝 Contributing

Issues and pull requests welcome!

## 💖 Support

If this helped you organize your library, consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting features
- 📖 Improving documentation

---

**Note**: This app works with Audiobookshelf libraries that use `metadata.json` files. Make sure your library is in the correct format before using.
