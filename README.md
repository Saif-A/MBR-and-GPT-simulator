# 💽 MBR & GPT Partition Table Simulator

An interactive educational tool to understand how MBR (Master Boot Record) and GPT (GUID Partition Table) partition tables work at the byte level.

![Partition Table Simulator](https://img.shields.io/badge/Educational-Tool-blue) ![HTML5](https://img.shields.io/badge/HTML5-CSS3-orange) ![JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-yellow)

## 🎯 Purpose

This simulator helps students, IT professionals, and curious learners understand:

- How partition tables are structured at the sector level
- The difference between MBR and GPT partitioning schemes
- Byte-level details: hex values, offsets, little-endian encoding
- Why MBR has limitations (4 partitions, 2TB max)
- How extended/logical partitions work (EBR chain)
- GPT's redundancy with backup tables

## ✨ Features

### MBR Mode
- **Boot Code Visualization** - See the 446-byte executable boot code area with hex preview
- **Partition Table** - Interactive 64-byte table showing all 4 partition entries
- **CHS & LBA Addressing** - View both legacy CHS and modern LBA values
- **Extended Partitions** - Create extended partitions with logical drives inside
- **EBR Chain** - Visualize the Extended Boot Record linked list structure
- **Active Partition** - Set any primary partition as bootable (0x80 flag)
- **Hex Data Display** - Raw 16-byte hex for each partition entry

### GPT Mode
- **128 Partitions** - Support for up to 128 partition entries
- **GUID-based Types** - EFI System, Microsoft Basic Data, Linux, macOS HFS+
- **Protective MBR** - See how GPT protects against legacy tools
- **Backup Table** - Visualize the mirrored backup at disk end (reverse order)
- **Structure Diagram** - Clear layout showing Primary → Data → Backup structure

### Visualization
- **Disk Bar** - Color-coded partition map with size percentages
- **Block Grid** - 200-block view (100 sectors each) showing allocation
- **Interactive Tooltips** - Hover for detailed sector/size information
- **Size Display** - Automatic KB/MB/GB conversion from sectors
- **Partition Manager** - List all partitions with quick actions

## 🚀 Getting Started

1. **Clone or Download** the repository
2. **Open** `index.html` in any modern web browser
3. **No server required** - runs entirely client-side

```bash
# Or simply double-click index.html
```

## 📖 How to Use

### Creating Partitions

1. Select **MBR** or **GPT** mode using the toggle buttons
2. Enter a partition name (optional)
3. Choose a filesystem type from the dropdown
4. Enter size in sectors (100 sectors ≈ 51.2 KB)
5. Click **Add Partition**

### MBR Extended/Logical Partitions

1. First create an **Extended Partition** (type 0x05)
2. Logical partition options will appear in the dropdown
3. Add logical partitions - they nest inside the extended partition
4. Each logical partition gets an EBR (Extended Boot Record)

### Setting Active Partition (MBR)

- Click the ⭐ **Set Active** button next to any primary partition
- The active partition (0x80) is what BIOS boots from
- Only one partition can be active at a time

### Understanding the Table

| Field | Bytes | Description |
|-------|-------|-------------|
| Status | 1 | `0x80` = Active/Bootable, `0x00` = Inactive |
| Start CHS | 3 | Cylinder-Head-Sector start (legacy) |
| Type | 1 | Filesystem ID (e.g., `0x07` = NTFS) |
| End CHS | 3 | Cylinder-Head-Sector end (legacy) |
| LBA Start | 4 | Logical Block Address (little-endian) |
| Size | 4 | Total sectors (little-endian) |

## 🔧 Technical Details

### Simulated Disk
- **Total Size**: 20,000 sectors (~10 MB simulated)
- **Sector Size**: 512 bytes
- **Block Size**: 100 sectors per visual block

### MBR Layout (Sector 0)
```
Offset  Size    Description
0x000   446     Boot Code (executable)
0x1BE   16      Partition Entry 1
0x1CE   16      Partition Entry 2
0x1DE   16      Partition Entry 3
0x1EE   16      Partition Entry 4
0x1FE   2       Boot Signature (0x55AA)
```

### GPT Layout
```
LBA 0       Protective MBR
LBA 1       Primary GPT Header
LBA 2-33    Partition Entries (128 × 128 bytes)
LBA 34-n    Partition Data
LBA n+1-32  Backup Partition Entries
Last LBA    Backup GPT Header
```

## 🎨 Partition Type Colors

| Type | Color | Description |
|------|-------|-------------|
| 0x07 | 🔵 Blue | NTFS / exFAT |
| 0x0B/0C | 🟢 Green | FAT32 |
| 0x83 | 🟠 Orange | Linux Native |
| 0x82 | 🟣 Purple | Linux Swap |
| 0x05 | ⚫ Grey | Extended |

## 📚 Educational Topics Covered

1. **Why MBR is limited to 4 partitions** - Only 64 bytes for the table
2. **Why MBR maxes out at 2TB** - 32-bit LBA × 512 bytes
3. **How extended partitions work** - EBR linked list inside extended
4. **Little-endian byte order** - See hex values reversed
5. **CHS vs LBA addressing** - Legacy vs modern methods
6. **GPT redundancy** - Backup table stored in reverse order
7. **Boot process** - BIOS loads boot code to 0x7C00

## 🛠️ Files

```
├── index.html      # Main HTML structure
├── style.css       # Styling and animations
├── script.js       # All simulation logic
└── README.md       # This file
```

## 🌐 Browser Support

- ✅ Chrome / Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## 📝 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Suggestions and improvements are welcome! Potential enhancements:

- [ ] 4K alignment warnings
- [ ] Full 512-byte hex sector view
- [ ] CHS ↔ LBA calculator
- [ ] Boot process animation
- [ ] MBR 2TB limit warning
- [ ] Export partition layout
- [ ] Quiz mode

---

**Made for learning** 📖 | Understanding partition tables one byte at a time
