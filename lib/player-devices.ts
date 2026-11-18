import {
  COMMAND_KEEP_MS,
  DEVICE_ONLINE_MS,
  type Device,
  type DeviceCommand,
  type DeviceKind,
  type DeviceState,
  readDeviceState,
} from "./devices";
import { type JSONValue, sql } from "./postgres";

export const DEVICES_CHANNEL = "player_devices";
const FORGET_AFTER = "1 day";

export type DeviceMessage =
  | { user: string; type: "device"; device: Device }
  | { user: string; type: "gone"; id: string }
  | { user: string; type: "command"; to: string };

const LONGEST_MESSAGE = 7500;

export function fitMessage(message: DeviceMessage) {
  const text = JSON.stringify(message);
  if (Buffer.byteLength(text) <= LONGEST_MESSAGE || message.type !== "device") return text;
  const device = message.device;
  return JSON.stringify({ ...message, device: { ...device, state: { ...device.state, upNext: [] } } });
}

async function tell(message: DeviceMessage) {
  await sql.notify(DEVICES_CHANNEL, fitMessage(message));
}

function toDevice(row: Record<string, unknown>): Device {
  return {
    id: row.device_id as string,
    name: row.name as string,
    kind: row.kind as DeviceKind,
    state: readDeviceState(row.state),
    at: (row.seen_at as Date).getTime(),
  };
}

export async function reportDevice(
  userId: string,
  report: { id: string; name: string; kind: DeviceKind; state: DeviceState },
) {
  const [row] = await sql`
    INSERT INTO player_devices (user_id, device_id, name, kind, state, seen_at)
    VALUES (${userId}, ${report.id}, ${report.name}, ${report.kind}, ${sql.json(report.state as unknown as JSONValue)}, now())
    ON CONFLICT (user_id, device_id) DO UPDATE
      SET name = EXCLUDED.name, kind = EXCLUDED.kind, state = EXCLUDED.state, seen_at = EXCLUDED.seen_at
    RETURNING device_id, name, kind, state, seen_at`;
  const device = toDevice(row);
  await tell({ user: userId, type: "device", device });
  await sql`DELETE FROM player_devices WHERE user_id = ${userId} AND seen_at < now() - ${FORGET_AFTER}::interval`;
  return device;
}

export async function listDevices(userId: string): Promise<Device[]> {
  const rows = await sql`
    SELECT device_id, name, kind, state, seen_at FROM player_devices
    WHERE user_id = ${userId} AND seen_at > now() - make_interval(secs => ${DEVICE_ONLINE_MS / 1000})
    ORDER BY seen_at DESC`;
  return rows.map(toDevice);
}

export async function leaveDevice(userId: string, id: string) {
  const gone = await sql`DELETE FROM player_devices WHERE user_id = ${userId} AND device_id = ${id} RETURNING 1`;
  await sql`DELETE FROM player_commands WHERE user_id = ${userId} AND device_id = ${id}`;
  if (gone.length > 0) await tell({ user: userId, type: "gone", id });
}

export async function sendCommand(userId: string, to: string, command: DeviceCommand) {
  const [known] = await sql`
    SELECT 1 FROM player_devices
    WHERE user_id = ${userId} AND device_id = ${to} AND seen_at > now() - make_interval(secs => ${DEVICE_ONLINE_MS / 1000})`;
  if (!known) return false;
  await sql`
    DELETE FROM player_commands
    WHERE user_id = ${userId} AND created_at < now() - make_interval(secs => ${COMMAND_KEEP_MS / 1000})`;
  await sql`
    INSERT INTO player_commands (user_id, device_id, command)
    VALUES (${userId}, ${to}, ${sql.json(command as unknown as JSONValue)})`;
  await tell({ user: userId, type: "command", to });
  return true;
}

export async function takeCommands(userId: string, id: string): Promise<DeviceCommand[]> {
  const rows = await sql`
    DELETE FROM player_commands
    WHERE user_id = ${userId} AND device_id = ${id}
    RETURNING id, command, created_at`;
  const fresh = Date.now() - COMMAND_KEEP_MS;
  return rows
    .filter((row) => (row.created_at as Date).getTime() > fresh)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((row) => row.command as DeviceCommand);
}

export function readDeviceMessage(text: string): DeviceMessage | null {
  try {
    const value = JSON.parse(text) as DeviceMessage;
    return typeof value?.user === "string" && typeof value.type === "string" ? value : null;
  } catch {
    return null;
  }
}
