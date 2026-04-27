import { PrismaClient } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

export async function saveRoom(
  roomId: string,
  hostDeviceId: string,
  config: object,
  state: object,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.room.upsert({
    where: { id: roomId },
    update: { state: JSON.stringify(state) },
    create: {
      id: roomId,
      hostDeviceId,
      config: JSON.stringify(config),
      state: JSON.stringify(state),
    },
  });
}

export async function loadAllRooms(): Promise<Array<{ id: string; hostDeviceId: string; config: string; state: string }>> {
  const prisma = getPrisma();
  return prisma.room.findMany({ where: { endedAt: null } });
}

export async function markRoomEnded(roomId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.room.update({
    where: { id: roomId },
    data: { endedAt: new Date() },
  });
}

export async function saveHandHistory(
  roomId: string,
  handNumber: number,
  data: object,
): Promise<void> {
  const prisma = getPrisma();
  await prisma.handHistory.create({
    data: {
      roomId,
      handNumber,
      data: JSON.stringify(data),
    },
  });
}

export async function getHandHistories(roomId: string): Promise<Array<{ handNumber: number; data: string; playedAt: Date }>> {
  const prisma = getPrisma();
  return prisma.handHistory.findMany({
    where: { roomId },
    orderBy: { playedAt: 'asc' },
  });
}

export async function banDevice(roomId: string, deviceId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.bannedDevice.upsert({
    where: { roomId_deviceId: { roomId, deviceId } },
    update: {},
    create: { roomId, deviceId },
  });
}

export async function isDeviceBanned(roomId: string, deviceId: string): Promise<boolean> {
  const prisma = getPrisma();
  const record = await prisma.bannedDevice.findUnique({
    where: { roomId_deviceId: { roomId, deviceId } },
  });
  return record !== null;
}
