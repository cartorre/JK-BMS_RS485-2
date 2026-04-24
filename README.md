# JK-BMS Multi-Battery Monitor (UART-TTL Protocol)

A Node.js application for real-time monitoring of up to 4 JK-BMS (JIKONG Battery Management System) batteries connected in parallel via the proprietary UART-TTL protocol.

## Hardware Requirements



| Component | Model | Specifications |
|-----------|-------|----------------|
| Computer | Raspberry Pi | (tested on Pi B
) |
| BMS | JK-PB1A16S-10P | 16S LiFePO4, 100A continuous, 1A active balancing |
| Firmware | V19.x | Tested on V19.26 |
| Protocol | UART-TTL Proprietary | Direct serial (NOT Modbus RS-485) |
| USB Adapter | SparkFun USB to RS-485 Converter | 

### BMS Technical Details
- Vendor ID: JK-PB1A16S10P
- Hardware Version: V19A
- Software Version: V19.26
- Cell Type: LFP (LiFePO4)
- Cell Configuration: 7S to 16S (tested with 15 cells in series)
- Balancing: Active supercapacitor-based, 1A maximum current
- Temperature Sensors: 1x internal MOSFET + 4x external NTC sensors
- Communication Interfaces: RS485

---

## Software Requirements

| Requirement | Minimum Version |
|-------------|-----------------|
| Node.js | 14.x or higher |
| npm | 6.x or higher |
| Operating System | Linux (tested) |



### Dependencies
{
  "dependencies": {
    "serialport": "^10.5.0"
  }
}

# 3. Configure serial port (edit jk-bms-monitor.js)
Linux:   /dev/ttyUSB0 (tested)


**Important Notes:**
- Cross-connect TX/RX: BMS TX → Converter RX, BMS RX → Converter TX
- Do NOT connect VBAT (battery voltage) to the converter
- The BMS uses 3.3V/5V TTL logic levels (not differential RS-485)
- Only connect the MASTER BMS directly; slave BMS units communicate through the RS-485 bus

### Battery Address Configuration
Each BMS must have a unique address (configured via the JK-BMS mobile app):
- **Address 0x00**: Master
- **Address 0x01**: Slave 1
- **Address 0x02**: Slave 2
- **Address 0x03**: Slave 3

## Software Requirements


### Operating System Compatibility
- **Linux**: Tested (Ubuntu 20.04+)


## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/cartorre/JK-BMS_RS485-2.git
cd JK-BMS_RS485-2

npm install

npm start
