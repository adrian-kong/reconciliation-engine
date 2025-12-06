import { MongoClient, Db, Collection } from "mongodb";
import type { Invoice, Payment, Reconciliation, Exception, Remittance, ProcessingJob } from "../types.js";
import { config } from "./config.js";

// Extended types with organizationId
export interface OrgInvoice extends Invoice {
  organizationId: string;
}

export interface OrgPayment extends Payment {
  organizationId: string;
}

export interface OrgReconciliation extends Reconciliation {
  organizationId: string;
}

export interface OrgException extends Exception {
  organizationId: string;
}

export interface OrgRemittance extends Remittance {
  organizationId: string;
}

export interface OrgProcessingJob extends ProcessingJob {
  organizationId: string;
}

export const client: MongoClient = new MongoClient(config.MONGODB_URI);
export const db: Db = client.db();

export async function initDatabase(uri: string): Promise<Db> {
  await client.connect();

  // Create indexes for performance
  await Promise.all([
    db.collection("invoices").createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection("payments").createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection("reconciliations").createIndex({ organizationId: 1 }),
    db.collection("exceptions").createIndex({ organizationId: 1, status: 1 }),
    db.collection("remittances").createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection("remittances").createIndex({ organizationId: 1, remittanceNumber: 1 }),
    db.collection("processing_jobs").createIndex({ organizationId: 1, createdAt: -1 }),
    db.collection("processing_jobs").createIndex({ organizationId: 1, status: 1 }),
  ]);

  console.log("✅ MongoDB connected and indexes created");
  return db;
}

export const collections = {
  invoices: (): Collection<OrgInvoice> => db.collection<OrgInvoice>("invoices"),
  payments: (): Collection<OrgPayment> => db.collection<OrgPayment>("payments"),
  reconciliations: (): Collection<OrgReconciliation> =>
    db.collection<OrgReconciliation>("reconciliations"),
  exceptions: (): Collection<OrgException> =>
    db.collection<OrgException>("exceptions"),
  remittances: (): Collection<OrgRemittance> =>
    db.collection<OrgRemittance>("remittances"),
  processingJobs: (): Collection<OrgProcessingJob> =>
    db.collection<OrgProcessingJob>("processing_jobs"),
};
