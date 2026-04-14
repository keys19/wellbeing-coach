import { prisma } from "@/lib/db/prisma";

type DatabaseStatus = {
    isConnected: boolean;
    lastChecked: Date;
    error?: string;
};

// Default initial status - use a function to avoid shared state during SSR
function getInitialDbStatus(): DatabaseStatus {
    return {
        isConnected: false,
        lastChecked: new Date(),
    };
}

// Store status in a variable that's recreated for each request in SSR
let dbStatus: DatabaseStatus = getInitialDbStatus();

/**
 * Checks the database connection status
 * @returns Promise<DatabaseStatus> The current database status
 */
export async function checkDatabaseConnection(): Promise<DatabaseStatus> {
    try {
        // Run a simple query to check connection
        // For MongoDB, we need to use a different approach since $runCommandRaw might not be available in all Prisma versions
        // Try a simple no-op query instead
        await prisma.$connect();

        // Create a timestamp that's consistent between server and client
        const timestamp = new Date();
        timestamp.setMilliseconds(0); // Remove milliseconds to avoid hydration issues

        dbStatus = {
            isConnected: true,
            lastChecked: timestamp,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Database connection error:", errorMessage);

        // Create a timestamp that's consistent between server and client
        const timestamp = new Date();
        timestamp.setMilliseconds(0); // Remove milliseconds to avoid hydration issues

        dbStatus = {
            isConnected: false,
            lastChecked: timestamp,
            error: errorMessage,
        };
    }

    return dbStatus;
}

/**
 * Gets the current database status without performing a new check
 * @returns DatabaseStatus The current cached status
 */
export function getDatabaseStatus(): DatabaseStatus {
    return { ...dbStatus }; // Return a copy to avoid mutations
}

/**
 * Initializes database status monitoring
 * Only use this function in client components with useEffect
 * @param intervalMs Optional interval in milliseconds for automatic checks (default: 60000ms)
 * @returns Function to stop monitoring
 */
export function initDatabaseMonitoring(intervalMs = 60000): () => void {
    // Only run in browser environment
    if (typeof window === 'undefined') {
        return () => { }; // Return no-op for SSR
    }

    // Check connection immediately
    checkDatabaseConnection();

    // Set interval for regular checks
    const intervalId = setInterval(async () => {
        await checkDatabaseConnection();
    }, intervalMs);

    // Return function to stop monitoring
    return () => clearInterval(intervalId);
}
