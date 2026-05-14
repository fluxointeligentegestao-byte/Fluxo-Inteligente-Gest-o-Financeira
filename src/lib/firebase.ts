import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
console.log(`[Firebase] Initializing with Project: ${firebaseConfig.projectId}, Database: ${dbId}`);

export const db = getFirestore(app, dbId !== '(default)' ? dbId : undefined);
export const auth = getAuth(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

async function testConnection() {
  try {
    console.log(`[Firebase] Testing connection to database: ${dbId}...`);
    // Try to get a non-existent doc to test connectivity
    const testDoc = doc(db, '_connection_test_', 'ping');
    await getDocFromServer(testDoc);
    console.log("[Firebase] Connection test successful!");
  } catch (error: any) {
    // If it's just a permission error or not found, it's actually "connected"
    if (error.code === 'permission-denied' || error.code === 'not-found') {
      console.log("[Firebase] Connection confirmed (received response from server).");
      return;
    }
    console.error("[Firebase] Connection test failed with error code:", error.code);
    console.error("[Firebase] Error message:", error.message);
    
    if (error.message.includes('offline')) {
      console.warn("[Firebase] Client reports offline. This might be a temporary network issue or a strictly blocked WebSocket. Retrying with longer timeout or different settings might be needed.");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
