import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { Actor, authorize, DomainError, scope } from "./auth";
import { db, transaction } from "./db";
import { randomUUID } from "node:crypto";
function s3() {
  if (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET)
    throw new DomainError("Document storage is not configured", 503);
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
  });
}
export async function upload(a: Actor, input: unknown) {
  const p = z
    .object({
      entityId: z.string(),
      name: z.string().min(1).max(200),
      contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      size: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .parse(input);
  authorize(
    a,
    ["GROUP_ADMIN", "ENTITY_ADMIN", "BUYER", "REQUESTER", "FINANCE"],
    p.entityId,
  );
  const e = await db.entity.findFirst({
    where: { id: p.entityId, tenantId: a.tenantId },
  });
  if (!e) throw new DomainError("Entity not found", 404);
  const key = a.tenantId + "/" + randomUUID();
  const client = s3();
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: p.contentType,
      ContentLength: p.size,
    }),
    { expiresIn: 300 },
  );
  const doc = await transaction(async (tx) => {
    const d = await tx.document.create({
      data: { ...p, tenantId: a.tenantId, key, uploadedBy: a.id },
    });
    await tx.audit.create({
      data: {
        tenantId: a.tenantId,
        entityId: p.entityId,
        actorId: a.id,
        action: "REQUEST_UPLOAD",
        targetType: "Document",
        targetId: d.id,
        reason: "Pending malware scan; not downloadable",
      },
    });
    return d;
  });
  return { id: doc.id, url, expiresIn: 300, scanStatus: "PENDING" };
}
export async function download(a: Actor, id: string) {
  const d = await db.document.findFirst({ where: { id, ...scope(a) } });
  if (!d || a.vendorId) throw new DomainError("Document not found", 404);
  if (d.scanStatus !== "CLEAN")
    throw new DomainError(
      "Download blocked until trusted malware scanner verifies document",
      409,
    );
  return {
    url: await getSignedUrl(
      s3(),
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: d.key }),
      { expiresIn: 60 },
    ),
    expiresIn: 60,
  };
}
