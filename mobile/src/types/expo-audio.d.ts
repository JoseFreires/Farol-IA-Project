declare module "expo-audio" {
  export interface PermissionResponse {
    status: "granted" | "undetermined" | "denied";
    granted: boolean;
    canAskAgain: boolean;
    expires: "never" | number;
  }

  export function getRecordingPermissionsAsync(): Promise<PermissionResponse>;
  export function requestRecordingPermissionsAsync(): Promise<PermissionResponse>;
}

