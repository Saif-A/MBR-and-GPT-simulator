// Simulation Constants
const DISK_TOTAL_SECTORS = 20000; 
const BLOCK_SIZE = 100; // Each block represents 100 sectors
const TOTAL_BLOCKS = Math.ceil(DISK_TOTAL_SECTORS / BLOCK_SIZE);
const BYTES_PER_SECTOR = 512;

let currentMode = 'mbr'; // 'mbr' or 'gpt'
let createdPartitions = [];  // Primary partitions (and extended)
let logicalPartitions = [];  // Logical partitions inside extended
let extendedPartition = null; // Reference to extended partition
let nextLba = 63; // Will change based on mode
let nextLogicalLba = 0; // Next LBA for logical partitions

// Geometry for CHS simulation (Standard legacy values)
const GEO = {
    sectorsPerTrack: 63,
    heads: 255
};

// GPT Constants
const GPT = {
    PROTECTIVE_MBR: 1, // Sector 0
    PRIMARY_HEADER: 1, // Sector 1
    PARTITION_ENTRIES: 32, // Sectors 2-33 (128 entries × 128 bytes ÷ 512)
    DATA_START: 34,
    MAX_PARTITIONS: 128
};

// Helper: Convert sectors to human readable size
function sectorsToSize(sectors) {
    const bytes = sectors * BYTES_PER_SECTOR;
    if (bytes >= 1024 * 1024 * 1024) {
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    } else if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }
    return bytes + ' B';
}

// DOM Elements
const visuals = {
    diskBar: document.getElementById('disk-bar'),
    tableBody: document.querySelector('#partition-table tbody'),
    tableHeader: document.getElementById('table-header'),
    blockGrid: document.getElementById('block-grid'),
    blockTooltip: document.getElementById('block-tooltip'),
    partitionList: document.getElementById('partition-list')
};

const inputs = {
    name: document.getElementById('pName'),
    type: document.getElementById('pType'),
    size: document.getElementById('pSize')
};

// Initialize
function init() {
    setupEventListeners();
    switchMode('mbr');
    render();
}

function setupEventListeners() {
    document.getElementById('addPartBtn').addEventListener('click', parseAndAddValues);
    document.getElementById('resetBtn').addEventListener('click', () => reset());
    document.getElementById('mbrMode').addEventListener('click', () => switchMode('mbr'));
    document.getElementById('gptMode').addEventListener('click', () => switchMode('gpt'));
    
    // Tab buttons for primary/backup table
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            render();
        });
    });
}

function switchMode(mode) {
    currentMode = mode;
    reset(false); // Reset partitions but don't re-render yet
    
    // Update UI
    document.getElementById('mbrMode').classList.toggle('active', mode === 'mbr');
    document.getElementById('gptMode').classList.toggle('active', mode === 'gpt');
    
    // Update form labels and options
    if (mode === 'mbr') {
        nextLba = 63;
        document.getElementById('mbrTypes').style.display = '';
        document.getElementById('logicalTypes').style.display = 'none';
        document.getElementById('gptTypes').style.display = 'none';
        document.getElementById('pType').value = '07';
        document.getElementById('diskInfo').textContent = `Total: ${sectorsToSize(DISK_TOTAL_SECTORS)} (${DISK_TOTAL_SECTORS.toLocaleString()} sectors)`;
        document.getElementById('legend1').textContent = 'MBR';
        document.getElementById('gptLegend').style.display = 'none';
        document.getElementById('gptBackupLegend').style.display = 'none';
        document.getElementById('backupTabBtn').style.display = 'none';
        document.getElementById('gpt-structure').style.display = 'none';
        document.getElementById('mbr-structure').style.display = 'block';
        renderBootCodePreview();
    } else {
        nextLba = GPT.DATA_START;
        document.getElementById('mbrTypes').style.display = 'none';
        document.getElementById('logicalTypes').style.display = 'none';
        document.getElementById('gptTypes').style.display = '';
        document.getElementById('pType').value = 'gpt-efi';
        document.getElementById('diskInfo').textContent = `Total: ${sectorsToSize(DISK_TOTAL_SECTORS)} (Up to ${GPT.MAX_PARTITIONS} partitions)`;
        document.getElementById('legend1').textContent = 'Protective MBR';
        document.getElementById('gptLegend').style.display = 'inline-flex';
        document.getElementById('gptBackupLegend').style.display = 'inline-flex';
        document.getElementById('backupTabBtn').style.display = 'inline-block';
        document.getElementById('gpt-structure').style.display = 'block';
        document.getElementById('mbr-structure').style.display = 'none';
    }
    
    updateTableStructure();
    updateInfoCards();
    render();
}

// Simulated MBR boot code (typical x86 bootstrap)
function renderBootCodePreview() {
    const hexPreview = document.getElementById('hexPreview');
    
    // This is a simplified representation of typical MBR boot code
    // Real MBR code varies by OS but follows similar patterns
    const bootCodeBytes = [
        // Common MBR bootstrap code pattern
        { offset: '0000', bytes: 'FA 33 C0 8E D0 BC 00 7C 8B F4 50 07 50 1F FB FC', ascii: '.3......|.P.P...' },
        { offset: '0010', bytes: 'BF 00 06 B9 00 01 F2 A5 EA 1D 06 00 00 BE BE 07', ascii: '................' },
        { offset: '0020', bytes: 'B3 04 80 3C 80 74 0E 80 3C 00 75 1C 83 C6 10 FE', ascii: '...<.t..<.u.....' },
        { offset: '0030', bytes: 'CB 75 EF CD 18 8B 14 8B 4C 02 8B EE 83 C6 10 FE', ascii: '.u......L.......' },
    ];
    
    let html = '';
    bootCodeBytes.forEach(line => {
        // Highlight different instruction types
        let highlightedBytes = line.bytes
            .replace(/^FA/, '<span class="instruction">FA</span>') // CLI
            .replace(/CD 18/, '<span class="jump">CD 18</span>') // INT 18
            .replace(/EA ([0-9A-F]{2} ){4}/g, '<span class="jump">$&</span>') // JMP FAR
            .replace(/75 [0-9A-F]{2}/g, '<span class="jump">$&</span>') // JNZ
            .replace(/74 [0-9A-F]{2}/g, '<span class="jump">$&</span>'); // JZ
        
        html += `
            <div class="hex-line">
                <span class="hex-offset">${line.offset}:</span>
                <span class="hex-bytes">${highlightedBytes}</span>
                <span class="hex-ascii">${line.ascii}</span>
            </div>
        `;
    });
    
    html += `
        <div class="hex-line" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #334155;">
            <span class="hex-offset" style="color: #64748b;">...</span>
            <span class="hex-bytes" style="color: #64748b; font-style: italic;">(440 more bytes of boot code)</span>
        </div>
        <div class="hex-line">
            <span class="hex-offset">01FE:</span>
            <span class="hex-bytes"><span class="instruction" style="color:#22c55e; background:#16532d; padding:0.1rem 0.3rem; border-radius:3px;">55 AA</span></span>
            <span class="hex-ascii" style="color: #22c55e;">← Boot Signature</span>
        </div>
    `;
    
    hexPreview.innerHTML = html;
}

function updateTableStructure() {
    if (currentMode === 'mbr') {
        document.getElementById('tableTitle').textContent = 'The 64-Byte Partition Table';
        document.getElementById('tableDescription').innerHTML = 
            'The MBR creates 4 partition entries of 16 bytes each. This table is located at offset <strong>0x1BE</strong> (446) in the first sector of the disk.';
        
        visuals.tableHeader.innerHTML = `
            <tr>
                <th width="5%">#</th>
                <th width="10%">Status<br><span class="byte-label">(1 Byte)</span></th>
                <th width="10%">Start CHS<br><span class="byte-label">(3 Bytes)</span></th>
                <th width="10%">Type<br><span class="byte-label">(1 Byte)</span></th>
                <th width="10%">End CHS<br><span class="byte-label">(3 Bytes)</span></th>
                <th width="15%">LBA Start<br><span class="byte-label">(4 Bytes)</span></th>
                <th width="15%">Total Sectors<br><span class="byte-label">(4 Bytes)</span></th>
                <th width="25%">Raw Hex Data<br><span class="byte-label">(16 Bytes)</span></th>
            </tr>
        `;
    } else {
        document.getElementById('tableTitle').textContent = 'GPT Partition Entries';
        document.getElementById('tableDescription').innerHTML = 
            'GPT supports up to 128 partitions with 128-byte entries. Each entry starts at LBA 2 (after protective MBR and primary GPT header).';
        
        visuals.tableHeader.innerHTML = `
            <tr>
                <th width="5%">#</th>
                <th width="15%">Name</th>
                <th width="25%">Type GUID</th>
                <th width="12%">First LBA</th>
                <th width="12%">Last LBA</th>
                <th width="10%">Flags</th>
                <th width="21%">Partition Name (UTF-16)</th>
            </tr>
        `;
    }
}

function updateInfoCards() {
    const infoContainer = document.getElementById('info-cards');
    
    if (currentMode === 'mbr') {
        let cards = `
            <div class="info-card">
                <h4>Status (Boot Flag)</h4>
                <p><code>0x80</code> indicates the active partition that the BIOS attempts to boot. <code>0x00</code> is inactive.</p>
            </div>
            <div class="info-card">
                <h4>CHS Addressing</h4>
                <p>Legacy Cylinder-Head-Sector addressing. On modern large disks, these bytes are often set to <code>FE FF FF</code> indicating the system should use the LBA value instead.</p>
            </div>
            <div class="info-card">
                <h4>LBA Start & Size</h4>
                <p><strong>LBA (Logical Block Addressing)</strong> uses a simple index for sectors. These are 32-bit values stored in <strong>Little Endian</strong> format (reversed byte order).</p>
            </div>
            <div class="info-card">
                <h4>Partition Type</h4>
                <p>A single byte ID defining the filesystem. E.g., Windows NTFS uses <code>07</code>, Linux uses <code>83</code>.</p>
            </div>
        `;
        
        // Add extended/logical partition explanation if they exist
        if (extendedPartition) {
            cards += `
                <div class="info-card" style="border-left-color:#64748b">
                    <h4>📦 Extended Partition</h4>
                    <p>Extended partitions (type <code>0x05</code>) act as containers for logical partitions. MBR can have only 4 primary entries, so the extended partition allows creating more partitions inside.</p>
                </div>
            `;
        }
        
        if (logicalPartitions.length > 0) {
            cards += `
                <div class="info-card" style="border-left-color:#f59e0b">
                    <h4>🔗 Logical Partitions & EBR Chain</h4>
                    <p>Each logical partition is preceded by an <strong>EBR (Extended Boot Record)</strong>. The EBRs form a linked list - each EBR points to the next one, creating a chain of partitions inside the extended partition.</p>
                </div>
            `;
        }
        
        infoContainer.innerHTML = cards;
    } else {
        infoContainer.innerHTML = `
            <div class="info-card">
                <h4>GUID Identification</h4>
                <p>Each partition type has a unique 128-bit <strong>GUID</strong> (Globally Unique Identifier) instead of a single byte. Much more flexible than MBR.</p>
            </div>
            <div class="info-card">
                <h4>Protective MBR</h4>
                <p>GPT includes a protective MBR at sector 0 to prevent legacy systems from treating GPT disks as unformatted.</p>
            </div>
            <div class="info-card" style="border-left-color:#c084fc">
                <h4>🔄 Backup Table (Mirrored)</h4>
                <p>The backup GPT is stored in <strong>reverse order</strong> at the disk end: Partition Entries come first, then the GPT Header at the very last LBA. This mirrors the primary structure for redundancy.</p>
            </div>
            <div class="info-card">
                <h4>128 Partitions</h4>
                <p>Unlike MBR's 4 primary partitions, GPT supports up to <strong>128 partitions</strong> by default, with no extended partition scheme needed.</p>
            </div>
        `;
    }
}

function parseAndAddValues() {
    const size = parseInt(inputs.size.value, 10);
    const typeStr = inputs.type.value;
    const name = inputs.name.value || (typeStr.startsWith('L') ? `Logical ${logicalPartitions.length + 1}` : `Partition ${createdPartitions.length + 1}`);

    if (isNaN(size) || size <= 0) {
        alert("Please enter a valid size.");
        return;
    }

    if (currentMode === 'mbr') {
        // Check if it's a logical partition
        if (typeStr.startsWith('L')) {
            const actualType = parseInt(typeStr.substring(1), 16);
            addLogicalPartition(actualType, size, name, typeStr.substring(1));
        } else {
            const type = parseInt(typeStr, 16);
            addPartition(type, size, false, name, typeStr);
        }
    } else {
        addPartition(typeStr, size, false, name, typeStr);
    }
    
    // Clear name input after adding
    inputs.name.value = '';
}

function addLogicalPartition(type, size, name, typeStr) {
    // Check if extended partition exists
    if (!extendedPartition) {
        alert("You must create an Extended Partition (0x05) first before adding logical partitions!");
        return;
    }
    
    // Calculate available space in extended partition
    const extendedEnd = extendedPartition.endLba;
    const nextLogical = nextLogicalLba;
    
    // Each logical needs 1 sector for EBR (Extended Boot Record)
    const ebrSize = 1;
    const dataStart = nextLogical + ebrSize;
    
    if (dataStart + size > extendedEnd + 1) {
        const available = extendedEnd - nextLogical - ebrSize + 1;
        alert(`Not enough space in extended partition! Available: ${available} sectors (${sectorsToSize(available)})`);
        return;
    }
    
    const partition = {
        id: logicalPartitions.length + 5, // Logical starts at 5
        name: name,
        status: 0x00,
        type: type,
        typeStr: typeStr,
        startLba: dataStart,
        endLba: dataStart + size - 1,
        size: size,
        ebrLba: nextLogical, // Location of this partition's EBR
        isLogical: true
    };
    
    partition.startChs = lbaToChs(partition.startLba);
    partition.endChs = lbaToChs(partition.endLba);
    
    logicalPartitions.push(partition);
    nextLogicalLba = partition.endLba + 1;
    
    render();
}

function addPartition(type, size, isBoot, name, typeStr) {
    // 1. Check Limits
    const maxPartitions = currentMode === 'mbr' ? 4 : GPT.MAX_PARTITIONS;
    if (createdPartitions.length >= maxPartitions) {
        alert(`${currentMode.toUpperCase()} Limit Reached: Maximum ${maxPartitions} partitions allowed.`);
        return;
    }
    
    // Check if trying to add second extended partition
    if (currentMode === 'mbr' && type === 0x05 && extendedPartition) {
        alert("Only one Extended Partition is allowed per disk!");
        return;
    }

    // 2. Check Disk Space
    if (nextLba + size > DISK_TOTAL_SECTORS) {
        alert(`Not enough space! Available: ${DISK_TOTAL_SECTORS - nextLba} sectors (${sectorsToSize(DISK_TOTAL_SECTORS - nextLba)})`);
        return;
    }

    // 3. Handle Active Flag (Only one active at a time usually)
    if (isBoot) {
        createdPartitions.forEach(p => p.status = 0x00);
    }

    // 4. Create Partition Object
    const startLba = nextLba;
    const endLba = startLba + size - 1;

    const partition = {
        id: createdPartitions.length + 1,
        name: name,
        status: isBoot ? 0x80 : 0x00,
        type: type,
        typeStr: typeStr,
        startLba: startLba,
        endLba: endLba,
        size: size
    };

    // Add CHS for MBR mode
    if (currentMode === 'mbr') {
        partition.startChs = lbaToChs(startLba);
        partition.endChs = lbaToChs(endLba);
        
        // Track extended partition
        if (type === 0x05) {
            extendedPartition = partition;
            nextLogicalLba = startLba; // Logical partitions start inside extended
            // Show logical partition options
            document.getElementById('logicalTypes').style.display = '';
        }
    } else {
        // GPT uses GUID
        partition.guid = generatePartitionGuid();
        partition.typeGuid = getTypeGuid(typeStr);
    }

    createdPartitions.push(partition);
    nextLba += size;

    render();
}

function reset(shouldRender = true) {
    createdPartitions = [];
    logicalPartitions = [];
    extendedPartition = null;
    nextLogicalLba = 0;
    nextLba = currentMode === 'mbr' ? 63 : GPT.DATA_START;
    
    // Hide logical options
    if (document.getElementById('logicalTypes')) {
        document.getElementById('logicalTypes').style.display = 'none';
    }
    if (shouldRender) render();
}

function render() {
    renderDiskMap();
    renderBlockGrid();
    renderTableRows();
    renderPartitionList();
    updateDiskStats();
    updateLegend();
    updateInfoCards();
}

function updateLegend() {
    const hasExtended = extendedPartition !== null;
    const hasLogical = logicalPartitions.length > 0;
    
    const extendedLegend = document.getElementById('extendedLegend');
    const logicalLegend = document.getElementById('logicalLegend');
    const ebrLegend = document.getElementById('ebrLegend');
    
    if (extendedLegend) extendedLegend.style.display = hasExtended ? 'inline' : 'none';
    if (logicalLegend) logicalLegend.style.display = hasLogical ? 'inline' : 'none';
    if (ebrLegend) ebrLegend.style.display = hasLogical ? 'inline' : 'none';
}

function updateDiskStats() {
    const usedSectors = nextLba - (currentMode === 'mbr' ? 63 : GPT.DATA_START);
    const freeSectors = DISK_TOTAL_SECTORS - nextLba;
    const usagePercent = ((usedSectors / DISK_TOTAL_SECTORS) * 100).toFixed(1);
    
    document.getElementById('totalSectors').textContent = DISK_TOTAL_SECTORS.toLocaleString();
    document.getElementById('totalMB').textContent = sectorsToSize(DISK_TOTAL_SECTORS);
    document.getElementById('usedSectors').textContent = usedSectors.toLocaleString();
    document.getElementById('usedMB').textContent = sectorsToSize(usedSectors);
    document.getElementById('freeSectors').textContent = freeSectors.toLocaleString();
    document.getElementById('freeMB').textContent = sectorsToSize(freeSectors);
    document.getElementById('usagePercent').textContent = usagePercent;
}

function setActivePartition(partitionId, isLogical = false) {
    if (isLogical) {
        // For logical partitions (they can't be active/bootable in traditional sense)
        alert("Logical partitions cannot be set as active. Only primary partitions can be bootable.");
        return;
    }
    createdPartitions.forEach(p => {
        p.status = (p.id === partitionId) ? 0x80 : 0x00;
    });
    render();
}

function deletePartition(partitionId, isLogical = false) {
    if (isLogical) {
        const idx = logicalPartitions.findIndex(p => p.id === partitionId);
        if (idx === -1) return;
        logicalPartitions.splice(idx, 1);
        
        // Recalculate logical partitions
        if (extendedPartition) {
            nextLogicalLba = extendedPartition.startLba;
            logicalPartitions.forEach((p, i) => {
                p.id = i + 5;
                const ebrSize = 1;
                p.ebrLba = nextLogicalLba;
                p.startLba = nextLogicalLba + ebrSize;
                p.endLba = p.startLba + p.size - 1;
                p.startChs = lbaToChs(p.startLba);
                p.endChs = lbaToChs(p.endLba);
                nextLogicalLba = p.endLba + 1;
            });
        }
        render();
        return;
    }
    
    const idx = createdPartitions.findIndex(p => p.id === partitionId);
    if (idx === -1) return;
    
    // Check if deleting extended partition
    const partition = createdPartitions[idx];
    if (partition.type === 0x05) {
        // Clear all logical partitions
        logicalPartitions = [];
        extendedPartition = null;
        nextLogicalLba = 0;
        document.getElementById('logicalTypes').style.display = 'none';
    }
    
    // Remove partition and recalculate LBAs
    createdPartitions.splice(idx, 1);
    
    // Recalculate all partition IDs and LBAs
    nextLba = currentMode === 'mbr' ? 63 : GPT.DATA_START;
    extendedPartition = null;
    createdPartitions.forEach((p, i) => {
        p.id = i + 1;
        p.startLba = nextLba;
        p.endLba = nextLba + p.size - 1;
        if (currentMode === 'mbr') {
            p.startChs = lbaToChs(p.startLba);
            p.endChs = lbaToChs(p.endLba);
            if (p.type === 0x05) {
                extendedPartition = p;
                // Recalculate logical LBAs
                nextLogicalLba = p.startLba;
                logicalPartitions.forEach((lp, j) => {
                    lp.ebrLba = nextLogicalLba;
                    lp.startLba = nextLogicalLba + 1;
                    lp.endLba = lp.startLba + lp.size - 1;
                    lp.startChs = lbaToChs(lp.startLba);
                    lp.endChs = lbaToChs(lp.endLba);
                    nextLogicalLba = lp.endLba + 1;
                });
            }
        }
        nextLba += p.size;
    });
    
    render();
}

function renderPartitionList() {
    if (createdPartitions.length === 0 && logicalPartitions.length === 0) {
        visuals.partitionList.innerHTML = '<p class="empty-msg">No partitions created yet. Add one above!</p>';
        return;
    }
    
    let html = '';
    
    // Render primary partitions
    html += createdPartitions.map(p => {
        const isActive = p.status === 0x80;
        const colorClass = getPartitionColorClass(p);
        const typeName = getTypeName(p);
        const isExtended = p.type === 0x05;
        const sizeDisplay = sectorsToSize(p.size);
        
        return `
            <div class="partition-item ${isActive ? 'active' : ''} ${isExtended ? 'extended' : ''}">
                <div class="partition-color ${colorClass}"></div>
                <div class="partition-details">
                    <div class="partition-name">${p.name} ${isExtended ? '📦' : ''}</div>
                    <div class="partition-info">
                        ${typeName} • LBA ${p.startLba}-${p.endLba} • ${p.size} sectors (${sizeDisplay})
                    </div>
                </div>
                ${isActive ? '<span class="active-badge">Active</span>' : ''}
                <div class="partition-actions">
                    ${!isActive && !isExtended ? `<button class="btn small active-toggle" onclick="setActivePartition(${p.id})">⭐ Set Active</button>` : ''}
                    <button class="btn small delete" onclick="deletePartition(${p.id})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Render logical partitions (indented)
    if (logicalPartitions.length > 0) {
        html += '<div class="logical-partitions-container">';
        html += '<div class="logical-header">└── Logical Partitions (inside Extended)</div>';
        html += logicalPartitions.map(p => {
            const colorClass = getPartitionColorClass(p);
            const typeName = getTypeName(p);
            const sizeDisplay = sectorsToSize(p.size);
            
            return `
                <div class="partition-item logical">
                    <div class="partition-color ${colorClass}"></div>
                    <div class="partition-details">
                        <div class="partition-name">${p.name} <span class="logical-badge">L${p.id - 4}</span></div>
                        <div class="partition-info">
                            ${typeName} • LBA ${p.startLba}-${p.endLba} • ${p.size} sectors (${sizeDisplay})<br>
                            <small>EBR at LBA ${p.ebrLba}</small>
                        </div>
                    </div>
                    <div class="partition-actions">
                        <button class="btn small delete" onclick="deletePartition(${p.id}, true)">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
        html += '</div>';
    }
    
    visuals.partitionList.innerHTML = html;
}

function getPartitionColorClass(p) {
    if (currentMode === 'mbr') {
        return `type-${p.type.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
        return `type-${p.typeStr}`;
    }
}

function getTypeName(p) {
    if (currentMode === 'mbr') {
        const types = {
            0x07: 'NTFS/exFAT',
            0x0B: 'FAT32',
            0x0C: 'FAT32 LBA',
            0x83: 'Linux',
            0x82: 'Linux Swap',
            0x05: 'Extended'
        };
        return types[p.type] || `Type 0x${p.type.toString(16).toUpperCase()}`;
    } else {
        const types = {
            'gpt-efi': 'EFI System',
            'gpt-msft-basic': 'Microsoft Basic Data',
            'gpt-linux': 'Linux Filesystem',
            'gpt-linux-swap': 'Linux Swap',
            'gpt-mac-hfs': 'Apple HFS+'
        };
        return types[p.typeStr] || p.typeStr;
    }
}

function renderDiskMap() {
    // Clear current partitions (keep offset 0 children if needed, but we rebuild innerHTML easily)
    visuals.diskBar.innerHTML = '';

    // Re-add MBR/GPT Block
    const headerBlock = document.createElement('div');
    headerBlock.className = 'mbr-sector';
    if (currentMode === 'mbr') {
        headerBlock.textContent = 'MBR';
        headerBlock.title = 'Sector 0: Master Boot Record';
    } else {
        headerBlock.textContent = 'GPT';
        headerBlock.title = 'Sectors 0-33: Protective MBR + GPT Header + Partition Entries';
        headerBlock.style.width = '50px';
    }
    visuals.diskBar.appendChild(headerBlock);

    // Add Partitions
    createdPartitions.forEach(p => {
        const el = document.createElement('div');
        const displayType = currentMode === 'mbr' ? 
            (typeof p.type === 'number' ? p.type.toString(16).toUpperCase().padStart(2, '0') : p.type) :
            p.typeStr;
        
        const isExtended = p.type === 0x05;
        el.className = `partition type-${displayType}`;
        
        // Calculate width %
        const percent = (p.size / DISK_TOTAL_SECTORS) * 100;
        el.style.width = `${percent}%`;
        
        const sizeDisplay = sectorsToSize(p.size);
        
        if (isExtended && logicalPartitions.length > 0) {
            // Extended partition contains logical partitions
            el.style.position = 'relative';
            el.style.padding = '0';
            el.innerHTML = '';
            
            // Add logical partitions inside extended
            let logicalHtml = '<div style="display:flex;height:100%;width:100%">';
            logicalPartitions.forEach(lp => {
                const lpPercent = (lp.size / p.size) * 100;
                const lpType = lp.type.toString(16).toUpperCase().padStart(2, '0');
                logicalHtml += `<div class="partition type-${lpType}" style="width:${lpPercent}%;border-left:2px dashed rgba(255,255,255,0.5)" title="${lp.name} (LBA: ${lp.startLba}-${lp.endLba}, ${sectorsToSize(lp.size)})">
                    <small>${lp.name}</small>
                </div>`;
            });
            // Add remaining free space in extended
            const usedInExtended = logicalPartitions.reduce((sum, lp) => sum + lp.size + 1, 0); // +1 for EBR each
            const freeInExtended = p.size - usedInExtended;
            if (freeInExtended > 0) {
                const freePercent = (freeInExtended / p.size) * 100;
                logicalHtml += `<div class="free-space" style="width:${freePercent}%;flex-grow:0" title="Free in Extended: ${freeInExtended} sectors (${sectorsToSize(freeInExtended)})"></div>`;
            }
            logicalHtml += '</div>';
            el.innerHTML = logicalHtml;
        } else {
            el.innerHTML = `${p.name} <span>(${sizeDisplay})</span>`;
        }
        
        el.title = `${p.name} (LBA: ${p.startLba}-${p.endLba}, ${sizeDisplay})`;
        visuals.diskBar.appendChild(el);
    });

    // Add Free Space
    const freeSectors = DISK_TOTAL_SECTORS - nextLba;
    if (freeSectors > 0) {
        const free = document.createElement('div');
        free.className = 'free-space';
        free.textContent = `Free (${sectorsToSize(freeSectors)})`;
        free.style.flexGrow = 1;
        free.title = `${freeSectors} sectors available (${sectorsToSize(freeSectors)})`;
        visuals.diskBar.appendChild(free);
    }
    
    // Add GPT Backup at the end
    if (currentMode === 'gpt') {
        const backupBlock = document.createElement('div');
        backupBlock.className = 'mbr-sector';
        backupBlock.style.background = 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)';
        backupBlock.style.width = '50px';
        backupBlock.textContent = 'BKP';
        backupBlock.title = 'Backup GPT Header + Entries (End of Disk)';
        visuals.diskBar.appendChild(backupBlock);
    }
}

function renderBlockGrid() {
    visuals.blockGrid.innerHTML = '';
    
    // Create array to track block status
    const blocks = new Array(TOTAL_BLOCKS).fill(null);
    
    // Mark special sectors based on mode
    if (currentMode === 'mbr') {
        blocks[0] = { type: 'mbr', label: 'MBR', sector: '0' };
    } else {
        // GPT structure
        blocks[0] = { type: 'mbr', label: 'Protective MBR', sector: '0' };
        blocks[0].fullLabel = 'Protective MBR (Sector 0)';
        
        // Primary GPT Header and entries (sectors 1-33)
        for (let i = 0; i < Math.ceil(GPT.DATA_START / BLOCK_SIZE); i++) {
            if (i === 0) continue; // Already marked as protective MBR
            const start = i * BLOCK_SIZE;
            const end = Math.min((i + 1) * BLOCK_SIZE - 1, GPT.DATA_START - 1);
            blocks[i] = { 
                type: start === 100 ? 'gpt-header' : 'gpt-entries', 
                label: start === 100 ? 'GPT Header' : 'GPT Entries',
                sector: `${start}-${end}`
            };
        }
    }
    
    // Mark partition blocks
    createdPartitions.forEach(p => {
        const startBlock = Math.floor(p.startLba / BLOCK_SIZE);
        const endBlock = Math.floor(p.endLba / BLOCK_SIZE);
        
        for (let i = startBlock; i <= endBlock && i < TOTAL_BLOCKS; i++) {
            blocks[i] = { 
                type: 'partition', 
                partition: p, 
                label: p.name,
                sector: `${i * BLOCK_SIZE}-${Math.min((i + 1) * BLOCK_SIZE - 1, DISK_TOTAL_SECTORS - 1)}`
            };
        }
    });
    
    // Mark logical partition blocks (override extended blocks)
    logicalPartitions.forEach(p => {
        const startBlock = Math.floor(p.startLba / BLOCK_SIZE);
        const endBlock = Math.floor(p.endLba / BLOCK_SIZE);
        
        for (let i = startBlock; i <= endBlock && i < TOTAL_BLOCKS; i++) {
            blocks[i] = { 
                type: 'logical', 
                partition: p, 
                label: p.name,
                sector: `${i * BLOCK_SIZE}-${Math.min((i + 1) * BLOCK_SIZE - 1, DISK_TOTAL_SECTORS - 1)}`
            };
        }
    });
    
    // Mark GPT backup at the end
    if (currentMode === 'gpt') {
        const backupStart = TOTAL_BLOCKS - 2;
        blocks[backupStart] = { type: 'gpt-backup', label: 'Backup GPT Entries', sector: `${backupStart * BLOCK_SIZE}-${(backupStart + 1) * BLOCK_SIZE - 1}` };
        blocks[TOTAL_BLOCKS - 1] = { type: 'gpt-backup', label: 'Backup GPT Header', sector: `${(TOTAL_BLOCKS - 1) * BLOCK_SIZE}-${DISK_TOTAL_SECTORS - 1}` };
    }
    
    // Create block elements
    blocks.forEach((block, idx) => {
        const el = document.createElement('div');
        el.className = 'block';
        
        if (!block) {
            el.classList.add('free');
            el.title = `Block ${idx}: Free`;
        } else if (block.type === 'mbr') {
            el.classList.add('mbr');
            el.title = block.fullLabel || `${block.label} (Sector ${block.sector})`;
        } else if (block.type === 'gpt-header') {
            el.classList.add('gpt-header');
            el.title = `GPT Header (Sector ${block.sector})`;
        } else if (block.type === 'gpt-entries') {
            el.classList.add('gpt-entries');
            el.title = `GPT Partition Entries (Sectors ${block.sector})`;
        } else if (block.type === 'gpt-backup') {
            el.classList.add('gpt-backup');
            el.title = `${block.label} (Sectors ${block.sector})`;
        } else if (block.type === 'partition') {
            const displayType = block.partition.typeStr || 
                (typeof block.partition.type === 'number' ? 
                    block.partition.type.toString(16).padStart(2, '0') : 
                    block.partition.type);
            el.classList.add('partition', `type-${displayType}`);
            el.title = `${block.partition.name} (Sectors ${block.sector}, ${sectorsToSize(block.partition.size)})`;
        } else if (block.type === 'logical') {
            const displayType = block.partition.type.toString(16).padStart(2, '0');
            el.classList.add('partition', `type-${displayType}`, 'logical-block');
            el.title = `Logical: ${block.partition.name} (Sectors ${block.sector}, ${sectorsToSize(block.partition.size)})`;
        }
        
        // Add hover effect
        el.addEventListener('mouseenter', (e) => showBlockTooltip(e, block, idx));
        el.addEventListener('mouseleave', hideBlockTooltip);
        
        visuals.blockGrid.appendChild(el);
    });
}

function showBlockTooltip(e, block, idx) {
    const tooltip = visuals.blockTooltip;
    const sectorRange = `${idx * BLOCK_SIZE}-${Math.min((idx + 1) * BLOCK_SIZE - 1, DISK_TOTAL_SECTORS - 1)}`;
    const blockSizeDisplay = sectorsToSize(BLOCK_SIZE);
    
    if (!block) {
        tooltip.textContent = `Block ${idx}: Free | Sectors ${sectorRange} | ${blockSizeDisplay}`;
    } else if (block.type === 'partition' || block.type === 'logical') {
        const prefix = block.type === 'logical' ? 'Logical: ' : '';
        tooltip.textContent = `${prefix}${block.partition.name} | LBA: ${block.partition.startLba}-${block.partition.endLba} | ${sectorsToSize(block.partition.size)}`;
    } else {
        tooltip.textContent = `${block.label} | Sectors: ${block.sector} | ${blockSizeDisplay}`;
    }
    
    tooltip.style.display = 'block';
    tooltip.style.left = e.pageX + 10 + 'px';
    tooltip.style.top = e.pageY + 10 + 'px';
}

function hideBlockTooltip() {
    visuals.blockTooltip.style.display = 'none';
}

function renderTableRows() {
    visuals.tableBody.innerHTML = '';

    if (currentMode === 'mbr') {
        renderMbrTable();
    } else {
        renderGptTable();
    }
}

function renderMbrTable() {
    // MBR has 4 slots fixed
    for (let i = 0; i < 4; i++) {
        const p = createdPartitions[i];
        const row = document.createElement('tr');

        if (p) {
            // Data Present
            const statusHex = toHex(p.status, 2);
            const typeHex = toHex(p.type, 2);
            
            const chsStartHex = chsToHexStr(p.startChs);
            const chsEndHex = chsToHexStr(p.endChs);
            
            const lbaHex = toLittleEndianHex(p.startLba, 4);
            const sizeHex = toLittleEndianHex(p.size, 4);

            const rawData = `${statusHex} ${chsStartHex} ${typeHex} ${chsEndHex} ${lbaHex} ${sizeHex}`;
            const activeIndicator = p.status === 0x80 ? ' <span style="color:#16a34a">★ Active</span>' : '';
            const sizeDisplay = sectorsToSize(p.size);

            row.innerHTML = `
                <td><strong>${i + 1}</strong>${activeIndicator}</td>
                <td><code style="${p.status===0x80 ? 'color:#16a34a; font-weight:bold':''}">${statusHex}</code></td>
                <td><code>${chsStartHex}</code></td>
                <td><code>${typeHex}</code></td>
                <td><code>${chsEndHex}</code></td>
                <td><code>${p.startLba}</code> <span style="color:#aaa">(${lbaHex})</span></td>
                <td><code>${p.size}</code> (${sizeDisplay}) <span style="color:#aaa">(${sizeHex})</span></td>
                <td class="hex-data">${rawData}</td>
            `;
        } else {
            // Empty Slot
            row.className = 'empty-row';
            row.innerHTML = `
                <td>${i + 1}</td>
                <td>00</td>
                <td>00 00 00</td>
                <td>00</td>
                <td>00 00 00</td>
                <td>00000000</td>
                <td>00000000</td>
                <td class="hex-data" style="opacity:0.5">00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00</td>
            `;
        }

        visuals.tableBody.appendChild(row);
    }
    
    // Add Logical Partitions (EBR chain)
    if (logicalPartitions.length > 0) {
        // Add separator row
        const sepRow = document.createElement('tr');
        sepRow.innerHTML = `<td colspan="8" style="background:#fef3c7; color:#92400e; text-align:center; font-weight:bold;">
            📦 Logical Partitions (EBR Chain inside Extended Partition)
        </td>`;
        visuals.tableBody.appendChild(sepRow);
        
        logicalPartitions.forEach((p, i) => {
            const row = document.createElement('tr');
            row.className = 'logical-row';
            
            const statusHex = toHex(p.status, 2);
            const typeHex = toHex(p.type, 2);
            const chsStartHex = chsToHexStr(p.startChs);
            const chsEndHex = chsToHexStr(p.endChs);
            const lbaHex = toLittleEndianHex(p.startLba - p.ebrLba, 4); // Relative to EBR
            const sizeHex = toLittleEndianHex(p.size, 4);
            const sizeDisplay = sectorsToSize(p.size);
            
            const rawData = `${statusHex} ${chsStartHex} ${typeHex} ${chsEndHex} ${lbaHex} ${sizeHex}`;
            
            row.innerHTML = `
                <td><strong>L${i + 1}</strong> <small>(EBR@${p.ebrLba})</small></td>
                <td><code>${statusHex}</code></td>
                <td><code>${chsStartHex}</code></td>
                <td><code>${typeHex}</code></td>
                <td><code>${chsEndHex}</code></td>
                <td><code>${p.startLba}</code> <span style="color:#aaa">(rel: ${lbaHex})</span></td>
                <td><code>${p.size}</code> (${sizeDisplay}) <span style="color:#aaa">(${sizeHex})</span></td>
                <td class="hex-data">${rawData}</td>
            `;
            
            visuals.tableBody.appendChild(row);
        });
    }
}

function renderGptTable() {
    // Check which tab is active
    const isBackupTab = document.querySelector('.tab-btn[data-tab="backup"]')?.classList.contains('active');
    
    // Show only created partitions (up to 128 possible)
    const displayCount = Math.max(createdPartitions.length, 8); // Show at least 8 rows
    
    // Update table description based on tab
    if (isBackupTab) {
        document.getElementById('tableDescription').innerHTML = 
            'This is the <strong>Backup Partition Table</strong> stored at the end of the disk. It mirrors the primary table for redundancy in case of corruption.';
    } else {
        document.getElementById('tableDescription').innerHTML = 
            'GPT supports up to 128 partitions with 128-byte entries. Each entry starts at LBA 2 (after protective MBR and primary GPT header).';
    }
    
    for (let i = 0; i < displayCount; i++) {
        const p = createdPartitions[i];
        const row = document.createElement('tr');

        if (p) {
            const flags = p.status === 0x80 ? '0x0000000000000001' : '0x0000000000000000';
            const nameUtf16 = stringToUtf16Hex(p.name);
            const activeIndicator = p.status === 0x80 ? ' <span style="color:#16a34a">★</span>' : '';
            
            row.innerHTML = `
                <td><strong>${i + 1}</strong>${activeIndicator}</td>
                <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${p.name}</td>
                <td class="hex-data" style="font-size:0.75rem">${p.typeGuid}</td>
                <td><code>${p.startLba}</code></td>
                <td><code>${p.endLba}</code></td>
                <td><code>${flags}</code></td>
                <td class="hex-data" style="font-size:0.75rem">${nameUtf16}</td>
            `;
        } else {
            row.className = 'empty-row';
            row.innerHTML = `
                <td>${i + 1}</td>
                <td style="color:#aaa">-</td>
                <td class="hex-data" style="opacity:0.5">00000000-0000-0000-0000-000000000000</td>
                <td>-</td>
                <td>-</td>
                <td>0x0000000000000000</td>
                <td style="color:#aaa">-</td>
            `;
        }

        visuals.tableBody.appendChild(row);
    }
    
    // Add note about backup location
    if (isBackupTab) {
        const noteRow = document.createElement('tr');
        noteRow.innerHTML = `<td colspan="7" style="text-align:center; background:#fef3c7; color:#92400e; font-style:italic;">
            📍 Backup table located at LBA ${DISK_TOTAL_SECTORS - 33} to ${DISK_TOTAL_SECTORS - 1}
        </td>`;
        visuals.tableBody.appendChild(noteRow);
    }
}

// Helpers

function toHex(num, digits) {
    return num.toString(16).toUpperCase().padStart(digits, '0');
}

function toLittleEndianHex(num, bytes) {
    let hex = [];
    for (let i = 0; i < bytes; i++) {
        hex.push(toHex((num >> (i * 8)) & 0xFF, 2));
    }
    return hex.join(' ');
}

// Convert LBA to CHS object {c, h, s}
// Not 100% perfect for all geometries but good for simulation
function lbaToChs(lba) {
    const sectorsPerTrack = GEO.sectorsPerTrack;
    const heads = GEO.heads;
    
    // Limits
    if (lba >= 1024 * heads * sectorsPerTrack) {
        // CHS maxed out
        return { c: 1023, h: 254, s: 63, maxed: true };
    }

    const c = Math.floor(lba / (heads * sectorsPerTrack));
    const temp = lba % (heads * sectorsPerTrack);
    const h = Math.floor(temp / sectorsPerTrack);
    const s = (temp % sectorsPerTrack) + 1;

    return { c, h, s, maxed: false };
}

// Encode CHS object to 3 Hex Bytes string: H S C
// Format: 
// Byte 1: Head
// Byte 2: Sector (bits 0-5) | (Cylinder bits 8-9 moved to 6-7)
// Byte 3: Cylinder (bits 0-7)
function chsToHexStr(chs) {
    if (chs.maxed) return "FE FF FF";

    const headByte = chs.h;
    
    // Cylinder bits 8 and 9
    const cylHigh2 = (chs.c >> 8) & 0x03;
    // Sector fits in low 6 bits (1-63)
    const sectorByte = (chs.s & 0x3F) | (cylHigh2 << 6);
    
    // Cylinder low 8 bits
    const cylLowByte = chs.c & 0xFF;

    return `${toHex(headByte, 2)} ${toHex(sectorByte, 2)} ${toHex(cylLowByte, 2)}`;
}

// GPT Helper Functions
function generatePartitionGuid() {
    // Generate a random GUID for the partition
    const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return `${hex()}${hex()}${hex()}${hex()}-${hex()}${hex()}-${hex()}${hex()}-${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`.toUpperCase();
}

function getTypeGuid(typeStr) {
    // Common GPT Type GUIDs
    const guids = {
        'gpt-efi': 'C12A7328-F81F-11D2-BA4B-00A0C93EC93B',
        'gpt-msft-basic': 'EBD0A0A2-B9E5-4433-87C0-68B6B72699C7',
        'gpt-linux': '0FC63DAF-8483-4772-8E79-3D69D8477DE4',
        'gpt-linux-swap': '0657FD6D-A4AB-43C4-84E5-0933C84B4F4F',
        'gpt-mac-hfs': '48465300-0000-11AA-AA11-00306543ECAC'
    };
    return guids[typeStr] || '00000000-0000-0000-0000-000000000000';
}

function stringToUtf16Hex(str) {
    // Convert string to UTF-16 LE hex (simplified - first 36 chars max for GPT)
    const maxChars = 36;
    const truncated = str.substring(0, maxChars);
    let hex = '';
    for (let i = 0; i < truncated.length; i++) {
        const code = truncated.charCodeAt(i);
        hex += toHex(code & 0xFF, 2) + ' ' + toHex((code >> 8) & 0xFF, 2) + ' ';
    }
    return hex.trim() || '(empty)';
}

// Start
init();