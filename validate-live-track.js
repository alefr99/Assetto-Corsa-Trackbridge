'use strict';
const fs = require('fs');
const crypto = require('crypto');
const EXPECTED_EXE = '1198feb7b1f39653fe51f04c9b0acb4d125a67d0e8ba6bda1fa353b3368ab356';
const WORLD = '/Game/Circuits/Bahrain/Lvl_Bahrain.Lvl_Bahrain';

function validateLiveTrack(fit, snapshot) {
  const failures = [];
  const topology = fit && fit.topology;
  if (!topology || !Array.isArray(topology.positionsCm) || !topology.positionsCm.length)
    throw new Error('Expected Kalinago topology with positionsCm');
  if (!Number.isInteger(topology.raceNodeCount) || topology.raceNodeCount < 3 || !Number.isInteger(topology.pitNodeCount) || topology.pitNodeCount < 2 || topology.raceNodeCount + topology.pitNodeCount !== topology.positionsCm.length) throw new Error('Invalid expected topology counts');
  for (const p of topology.positionsCm) if (!p || ![p.X,p.Y,p.Z].every(Number.isFinite)) throw new Error('Invalid expected position');
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.tracks)) throw new Error('Invalid runtime snapshot');
  if (fit.targetSlot?.toLowerCase() !== 'bahrain') failures.push('Unexpected target slot');
  if (snapshot.executableSha256 !== EXPECTED_EXE) failures.push('Executable does not match validated offsets');
  if (snapshot.world !== WORLD) failures.push('Bahrain slot is not loaded');
  if (snapshot.errors !== 0) failures.push('Runtime capture contains read errors');
  const tracks = (snapshot.tracks || []).filter(t => t && t.fullPath === WORLD + '.PersistentLevel.RaceSimTrackActor_1.RaceTrackSpline');
  if (tracks.length !== 1) failures.push('Expected exactly one live race component in the loaded world');
  let maxPositionErrorCm = null;
  if (tracks.length === 1) {
    const track = tracks[0];
    if (track.raceCount !== topology.raceNodeCount || track.pitCount !== topology.pitNodeCount)
      failures.push('Race/pit node counts differ from Kalinago');
    if (!Array.isArray(track.nodes) || track.nodes.length !== topology.positionsCm.length) failures.push('Total node count differs from Kalinago');
    else {
      maxPositionErrorCm = 0;
      for (let i = 0; i < track.nodes.length; i++) {
        const node = track.nodes[i];
        if (!node || node.index !== i || !Array.isArray(node.position) || node.position.length !== 3 || !Array.from(node.position).every(Number.isFinite)) {
          failures.push('Invalid live node ' + i);
          continue;
        }
        const expected = topology.positionsCm[i];
        const values = [expected.X, expected.Y, expected.Z];
        if (!values.every(Number.isFinite)) throw new Error('Invalid expected position');
        maxPositionErrorCm = Math.max(maxPositionErrorCm, ...values.map((v, axis) => Math.abs(v - node.position[axis])));
      }
      if (maxPositionErrorCm > 0.1) failures.push('Live coordinates differ from Kalinago by more than 0.1 cm');
    }
  }
  return { installable: false, passed: failures.length === 0, check: 'live-track-identity-only',
    capturedUtc: snapshot.capturedUtc, maxPositionErrorCm, failures,
    weekendValidated: false, raceValidated: false,
    limitations: ['Identity check does not prove lap counting, pit stops, sectors, finish or visual correctness',
      'ReadProcessMemory snapshot is not atomic'] };
}
module.exports = { validateLiveTrack };
if (require.main === module) {
  const [fitFile, snapshotFile, output] = process.argv.slice(2);
  if (!fitFile || !snapshotFile || !output) throw new Error('Usage: node validate-live-track.js FIT SNAPSHOT NEW_REPORT');
  const fitBytes = fs.readFileSync(fitFile), snapshotBytes = fs.readFileSync(snapshotFile);
  const result = validateLiveTrack(JSON.parse(fitBytes), JSON.parse(snapshotBytes));
  result.inputs = [fitBytes, snapshotBytes].map(b => crypto.createHash('sha256').update(b).digest('hex'));
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 2;
}
