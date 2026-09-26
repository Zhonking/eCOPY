// Creates fake camera cards + target disks in .sandbox for end-to-end testing.
// Usage: node scripts/make-test-cards.js [--clean] [--sizeMB=8]
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve('.sandbox');
const args = process.argv.slice(2);
const clean = args.includes('--clean');
const sizeArg = args.find((a) => a.startsWith('--sizeMB='));
const MB = sizeArg ? Number(sizeArg.split('=')[1]) : 8;

const pad = (n) => crypto.randomBytes(n * 1024 * 1024);

async function put(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function media(file, mb = MB) {
  await put(file, pad(mb));
}

async function main() {
  if (clean && existsSync(root)) await rm(root, { recursive: true, force: true });

  // ---- ARRI (ALEXA/AMIRA MXF) ----
  const arri = `${root}/cards/ARRI_A001`;
  await media(`${arri}/AVF/A001C001_21090101_C001.mxf`);
  await put(
    `${arri}/AVF/A001C001_21090101_C001.xml`,
    `<?xml version="1.0"?><CameraClip xmlns="http://www.arri.de/Metadata">
      <Reel>A001</Reel><Scene>12</Scene><Take>1</Take>
      <TcStart>10:23:11:04</TcStart><FrameRate>24.000</FrameRate>
      <CameraModel>ALEXA 35</CameraModel><ColorSpace>ARRI LogC4</ColorSpace>
      <AudioChannels>2</AudioChannels><LutName>REC709</LutName>
    </CameraClip>`
  );
  await media(`${arri}/AVF/A001C002_21090101_C002.mxf`, MB);
  await put(`${arri}/CLIPS/.keep`, '');

  // ---- RED ----
  const red = `${root}/cards/RED_A002`;
  await media(`${red}/DCIM/101RED01/A001_C001_0501X23.RDC/A001_C001_0501X23.R3D`);
  await put(
    `${red}/DCIM/101RED01/A001_C001_0501X23.RDC/A001_C001_0501X23.RMD`,
    `<?xml version="1.0"?><REDMETA><Reel>A002</Reel><Scene>SC03</Scene><Take>2</Take>
    <Start>09:10:00:12</Start><FrameRate>23.976</FrameRate><ColorSpace>REDLogFilm</ColorSpace>
    <AudioChannels>4</AudioChannels></REDMETA>`
  );

  // ---- Sony XAVC ----
  const sony = `${root}/cards/SONY_A003`;
  await media(`${sony}/PRIVATE/M4ROOT/CLIP/C0001.MP4`);
  await put(
    `${sony}/PRIVATE/M4ROOT/CLIP/C0001.XML`,
    `<?xml version="1.0"?>
    <NonRealTimeMeta xmlns="http://xmlns.sony.net/pro/metadata/nonrealtimemeta">
      <LTC startDate="2026-09-25T08:00:00:00" endDate="2026-09-25T08:02:00:00"/>
      <VideoFormat videoFrame="24p" captureTime="2026-09-25T08:00:00Z"/>
      <AudioFormat numTrack="2"/>
      <AcquisitionRecord><Group name="SYSTEM"><Parameter name="Camera" value="ILME-FX6"/></Group></AcquisitionRecord>
      <ColorSpace>S-Gamut3/S-Log3</ColorSpace>
    </NonRealTimeMeta>`
  );

  // ---- Blackmagic ----
  const bmd = `${root}/cards/BMD_A004`;
  await media(`${bmd}/A001/A001_C001_0912M0.braw`);
  await put(
    `${bmd}/A001/A001_C001_0912M0.sidecar`,
    `Blackmagic RAW Sidecar\nReel: A004\nTake: 1\nStart Timecode: 14:30:00:00\nFrame Rate: 25\nColor Space: Blackmagic Design Film Gen 5\n`
  );

  // ---- Canon Cinema RAW Light ----
  const canon = `${root}/cards/CANON_A005`;
  await media(`${canon}/DCIM/100CANON/A001_C001_0912KX.CRM`);
  await put(
    `${canon}/DCIM/100CANON/A001_C001_0912KX.XML`,
    `<?xml version="1.0"?><CanonMetadata><Reel>A005</Reel><Scene>5</Scene><Take>1</Take>
    <Start>07:45:12:00</Start><FrameRate>24.000</FrameRate>
    <CameraModel>EOS C500 Mark II</CameraModel><ColorSpace>Canon Log 3</ColorSpace><AudioChannels>4</AudioChannels>
    </CanonMetadata>`
  );

  // ---- Target drives ----
  for (const t of ['HDD_A', 'HDD_B', 'NAS_C']) {
    await mkdir(`${root}/targets/${t}`, { recursive: true });
  }

  console.log(`Sandbox ready at ${root}`);
  console.log(`Cards  : ${root}/cards/{ARRI_A001,RED_A002,SONY_A003,BMD_A004,CANON_A005}`);
  console.log(`Targets: ${root}/targets/{HDD_A,HDD_B,NAS_C}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
