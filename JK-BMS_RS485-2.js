// ═══════════════════════════════════════════════════════════════════════════════
// JK-BMS MONITOR - Proprietary UART-TTL Protocol
// Hardware: JK-PB1A16S-10P (Firmware V19)
// Validated with official JK-BMS Windows Monitor Software
// ═══════════════════════════════════════════════════════════════════════════════

const { SerialPort } = require('serialport');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════
const SERIAL_PORT = '/dev/ttyUSB0';
const BAUDRATE = 115200;

const BATTERIES = [
    { id: 0x00, label: 'MASTER' },
    { id: 0x01, label: 'SLAVE 1' },
    { id: 0x02, label: 'SLAVE 2' },
    { id: 0x03, label: 'SLAVE 3' }
];

// ═══════════════════════════════════════════════════════════
// VALIDATED OFFSET MAP
// ═══════════════════════════════════════════════════════════
const OFFSETS = {
    // --- Cell Voltages (UINT16, mV) ---
    cellVoltages: {
        start: 6,
        count: 15,
        step: 2,
        scale: 0.001,
        unit: 'V'
    },

    // --- Wire Resistances (UINT16, mΩ) ---
    cellResistances: {
        start: 80,
        count: 15,
        step: 2,
        scale: 1,
        unit: 'mΩ'
    },

    // --- Total Pack Voltage (UINT32, mV) ---
    totalVoltage:    { offset: 150, type: 'UINT32', scale: 0.001, unit: 'V' },

    // --- Pack Current (INT16, mA) ---
    current:         { offset: 158, type: 'INT16', scale: 0.001, unit: 'A' },

    // --- Power (UINT32, mW) ---
    power:           { offset: 180, type: 'UINT32', scale: 0.001, unit: 'W' },

    // --- State of Charge (UINT8, %) ---
    soc:             { offset: 173, type: 'UINT8',  scale: 1,     unit: '%' },

    // --- Capacities (mAh -> Ah) ---
    remainingCap:    { offset: 168, type: 'INT32',  scale: 0.001, unit: 'Ah' },
    totalCap:        { offset: 172, type: 'UINT32', scale: 0.001, unit: 'Ah' },

    // --- Balancing Current (INT16, mA) ---
    balanceCurrent:  { offset: 170, type: 'INT16', scale: 0.001, unit: 'A' },

    // --- Alarm Register (UINT32, 32 bits) ---
    alarms:          { offset: 160, type: 'UINT32', scale: 1,     unit: 'flags' },

    // --- Temperatures (INT16, 0.1°C) ---
    temperatures: [
        { offset: 144, name: 'MOS',   desc: 'MOSFET Heatsink' },
        { offset: 162, name: 'T1',    desc: 'External NTC 1' },
        { offset: 164, name: 'T2',    desc: 'External NTC 2' },
        { offset: 254, name: 'T4',    desc: 'External NTC 4' },
        { offset: 258, name: 'T5',    desc: 'External NTC 5' }
    ],

    // --- MOSFET States (UINT8, 0=OFF 1=ON) ---
    chargeStatus:     { offset: 198, type: 'UINT8', scale: 1, unit: '' },
    dischargeStatus:  { offset: 199, type: 'UINT8', scale: 1, unit: '' },
    preDischargeStatus: { offset: 200, type: 'UINT8', scale: 1, unit: '' },

    // --- Identification ---
    deviceId:        { offset: 300, type: 'UINT8', scale: 1, unit: '' }
};

// ═══════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════
class JKBMSMonitor {
    constructor(port, baudrate) {
        this.port = port;
        this.baudrate = baudrate;
        this.buffer = Buffer.alloc(0);
        this.batteries = {};
        this.frameCount = 0;
        this.lastDisplay = 0;

        BATTERIES.forEach(b => {
            this.batteries[b.id] = { id: b.id, label: b.label, lastUpdate: null, data: null };
        });
    }

    // --- Serial Connection ---
    async connect() {
        this.serial = new SerialPort({ path: this.port, baudRate: this.baudrate, dataBits: 8, parity: 'none', stopBits: 1 });

        return new Promise((resolve, reject) => {
            this.serial.on('open', () => {
                console.log(`JK-BMS Monitor | ${this.port} @ ${this.baudrate} baud`);
                console.log(`Hardware: JK-PB1A16S-10P (V19) | Protocol: Proprietary UART-TTL\n`);
                resolve();
            });
            this.serial.on('error', (err) => reject(err));
            this.serial.on('data', (data) => {
                this.buffer = Buffer.concat([this.buffer, data]);
                this._processBuffer();
            });
        });
    }

    // --- Buffer Processing ---
    _processBuffer() {
        if (this.buffer.length < 308) return;

        for (let i = 0; i <= this.buffer.length - 4; i++) {
            if (this.buffer[i] === 0x55 && this.buffer[i+1] === 0xAA &&
                this.buffer[i+2] === 0xEB && this.buffer[i+3] === 0x90) {

                const frameType = this.buffer[i + 4];

                if (frameType === 2 && this.buffer.length >= i + 308) {
                    const frame = this.buffer.slice(i, i + 308);
                    const deviceId = frame[300];
                    if (deviceId >= 0x00 && deviceId <= 0x03) {
                        this._parseFrame(frame, deviceId);
                    }
                    this.buffer = this.buffer.slice(i + 308);
                    return;
                }

                if (frameType === 1 && this.buffer.length >= i + 308) {
                    this.buffer = this.buffer.slice(i + 308);
                    return;
                }

                this.buffer = this.buffer.slice(i + 1);
                return;
            }
        }

        if (this.buffer.length > 2000) this.buffer = this.buffer.slice(-308);
    }

    // --- Read Value from Frame ---
    _read(frame, config) {
        switch (config.type) {
            case 'UINT8':  return frame[config.offset] * config.scale;
            case 'INT16':  return frame.readInt16LE(config.offset) * config.scale;
            case 'UINT16': return frame.readUInt16LE(config.offset) * config.scale;
            case 'UINT32': return frame.readUInt32LE(config.offset) * config.scale;
            case 'INT32':  return frame.readInt32LE(config.offset) * config.scale;
            default: return 0;
        }
    }

    // --- Parse Frame ---
    _parseFrame(frame, deviceId) {
        this.frameCount++;

        // Cell voltages
        const cellVoltages = [];
        for (let i = 0; i < OFFSETS.cellVoltages.count; i++) {
            const offset = OFFSETS.cellVoltages.start + (i * OFFSETS.cellVoltages.step);
            const raw = frame.readUInt16LE(offset);
            if (raw >= 3000 && raw <= 3800) cellVoltages.push(raw * OFFSETS.cellVoltages.scale);
        }

        // Cell resistances
        const cellResistances = [];
        for (let i = 0; i < OFFSETS.cellResistances.count; i++) {
            const offset = OFFSETS.cellResistances.start + (i * OFFSETS.cellResistances.step);
            cellResistances.push(frame.readUInt16LE(offset));
        }

        // Main data
        const totalVoltage  = this._read(frame, OFFSETS.totalVoltage);
        const current       = this._read(frame, OFFSETS.current);
        const power         = this._read(frame, OFFSETS.power);
        const soc           = this._read(frame, OFFSETS.soc);
        const remainingCap  = this._read(frame, OFFSETS.remainingCap);
        const totalCap      = this._read(frame, OFFSETS.totalCap);
        const balanceCurr   = this._read(frame, OFFSETS.balanceCurrent);
        const alarms        = this._read(frame, OFFSETS.alarms);

        // MOSFET states
        const charge        = this._read(frame, OFFSETS.chargeStatus) === 1 ? 'ON' : 'OFF';
        const discharge     = this._read(frame, OFFSETS.dischargeStatus) === 1 ? 'ON' : 'OFF';
        const preDischarge  = this._read(frame, OFFSETS.preDischargeStatus) === 1 ? 'ON' : 'OFF';
        const balance       = Math.abs(balanceCurr) > 0.01 ? 'ON' : 'OFF';

        // Temperatures
        const temps = {};
        OFFSETS.temperatures.forEach(t => {
            temps[t.name] = (this._read(frame, { offset: t.offset, type: 'INT16', scale: 0.1 })).toFixed(1);
        });

        // Status
        let status = 'IDLE';
        if (current > 0.5) status = 'CHARGING';
        else if (current < -0.5) status = 'DISCHARGING';

        // Statistics
        const maxV = cellVoltages.length ? Math.max(...cellVoltages) : 0;
        const minV = cellVoltages.length ? Math.min(...cellVoltages) : 0;
        const avgV = cellVoltages.length ? cellVoltages.reduce((a,b) => a+b, 0) / cellVoltages.length : 0;
        const diffV = (maxV - minV) * 1000;

        this.batteries[deviceId] = {
            ...this.batteries[deviceId],
            lastUpdate: new Date(),
            data: {
                totalVoltage, current, power, soc, status,
                remainingCap, totalCap, balanceCurr, balance,
                charge, discharge, preDischarge,
                cellCount: cellVoltages.length,
                maxVoltage: maxV, minVoltage: minV, avgVoltage: avgV, voltageDiff: diffV,
                temperatures: temps,
                cellResistances, alarms, cellVoltages
            }
        };

        if (Date.now() - this.lastDisplay > 500) {
            this.lastDisplay = Date.now();
            this._display();
        }
    }

    // --- Display ---
    _display() {
        console.clear();
        const now = new Date().toLocaleString();

        console.log(`\n${'='.repeat(160)}`);
        console.log(`                         JK-BMS MONITOR | 4 BATTERIES | ${now} | Frames: ${this.frameCount}`);
        console.log(`${'='.repeat(160)}`);

        // Summary Table
        console.log(`  Battery     | Voltage | Current | Power   | SOC  | Status        | MOS   | T1    | T2    | T4    | T5    | ΔmV   | Charge | Disch  | PreDis | Balance`);
        console.log(`${'-'.repeat(160)}`);

        for (const b of BATTERIES) {
            const d = this.batteries[b.id].data;
            const l = b.label.padEnd(11);

            if (d && d.cellCount > 0) {
                const t = d.temperatures;
                console.log(`  ${l} | ${d.totalVoltage.toFixed(2).padStart(6)}V | ${d.current.toFixed(2).padStart(8)}A | ${d.power.toFixed(0).padStart(7)}W | ${d.soc.toFixed(0).padStart(3)}% | ${d.status.padEnd(13)} | ${(t.MOS||'--').padStart(4)}C | ${(t.T1||'--').padStart(4)}C | ${(t.T2||'--').padStart(4)}C | ${(t.T4||'--').padStart(4)}C | ${(t.T5||'--').padStart(4)}C | ${d.voltageDiff.toFixed(0).padStart(5)}mV | ${d.charge.padEnd(6)} | ${d.discharge.padEnd(6)} | ${d.preDischarge.padEnd(6)} | ${d.balance.padEnd(7)}`);
            } else {
                console.log(`  ${l} |  ---V  |   ---A   |   ---W  |  -  | ---           |  -- |  -- |  -- |  -- |  -- |   ---mV |  ---   |  ---   |  ---   |  ---`);
            }
        }

        // Cells side by side
        console.log(`\n${'='.repeat(160)}`);
        console.log(`  CELLS - VOLTAGE (V) AND RESISTANCE (mΩ)`);
        console.log(`  Cel | ${'MASTER'.padEnd(17)} | ${'SLAVE 1'.padEnd(17)} | ${'SLAVE 2'.padEnd(17)} | ${'SLAVE 3'.padEnd(17)}`);
        console.log(`      | ${'Voltage Resist'.padEnd(17)} | ${'Voltage Resist'.padEnd(17)} | ${'Voltage Resist'.padEnd(17)} | ${'Voltage Resist'.padEnd(17)}`);
        console.log(`${'-'.repeat(160)}`);

        for (let i = 0; i < 15; i++) {
            let line = `  C${(i+1).toString().padStart(2)} | `;
            for (const b of BATTERIES) {
                const d = this.batteries[b.id].data;
                if (d && d.cellVoltages && d.cellVoltages.length > i) {
                    const v = d.cellVoltages[i].toFixed(3) + 'V';
                    const r = (d.cellResistances && d.cellResistances.length > i) ? d.cellResistances[i] + 'mΩ' : '---';
                    line += `${v.padEnd(6)} ${r.padEnd(9)} | `;
                } else {
                    line += `${'---'.padEnd(6)} ${'---'.padEnd(9)} | `;
                }
            }
            console.log(line);
        }

        // Statistics
        console.log(`\n${'='.repeat(160)}`);
        console.log(`  STATISTICS`);
        console.log(`  Parameter         | ${'MASTER'.padEnd(17)} | ${'SLAVE 1'.padEnd(17)} | ${'SLAVE 2'.padEnd(17)} | ${'SLAVE 3'.padEnd(17)}`);
        console.log(`${'-'.repeat(160)}`);

        const stats = [
            ['Maximum (V)',      d => d?.maxVoltage?.toFixed(3) || '---'],
            ['Minimum (V)',      d => d?.minVoltage?.toFixed(3) || '---'],
            ['Average (V)',      d => d?.avgVoltage?.toFixed(3) || '---'],
            ['Delta (mV)',       d => d?.voltageDiff?.toFixed(0) || '---'],
            ['Remain Cap (Ah)',  d => d?.remainingCap?.toFixed(1) || '---'],
            ['Total Cap (Ah)',   d => d?.totalCap?.toFixed(0) || '---'],
            ['Charge',           d => d?.charge || '---'],
            ['Discharge',        d => d?.discharge || '---'],
            ['Pre-Discharge',    d => d?.preDischarge || '---'],
            ['Balancing',        d => d?.balance || '---'],
        ];

        for (const [label, fn] of stats) {
            let line = `  ${label.padEnd(18)} |`;
            for (const b of BATTERIES) {
                const val = fn(this.batteries[b.id].data);
                line += ` ${val.toString().padEnd(17)} |`;
            }
            console.log(line);
        }

        console.log(`${'='.repeat(160)}\n`);
    }

    stop() {
        if (this.serial?.isOpen) this.serial.close();
        console.log('Monitor stopped.');
    }
}

// ═══════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════
const monitor = new JKBMSMonitor(SERIAL_PORT, BAUDRATE);

process.on('SIGINT', () => { monitor.stop(); process.exit(0); });

monitor.connect().catch(console.error);