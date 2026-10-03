export type UserRole = "DISPATCHER" | "LOADER" | "DRIVER" | "STORE_MANAGER";

export type RoleOption = {
  id: UserRole;
  label: string;
  subtitle: string;
  defaultLogin?: string;
};

export const ROLE_OPTIONS: readonly RoleOption[] = [
  {
    id: "DISPATCHER",
    label: "Dispatcher",
    subtitle: "Plan & Optimize",
    defaultLogin: "seed.dispatcher",
  },
  {
    id: "LOADER",
    label: "Loader",
    subtitle: "Prepare & Load",
    defaultLogin: "seed.loader",
  },
  {
    id: "DRIVER",
    label: "Driver",
    subtitle: "Deliver & Report",
    defaultLogin: "seed.driver",
  },
  {
    id: "STORE_MANAGER",
    label: "Store Manager",
    subtitle: "Verify & Confirm",
    defaultLogin: "seed.store-manager",
  },
];

export type LoginFormValues = {
  loginIdentifier: string;
  password: string;
  role?: UserRole;
};

export type LoginFormErrors = {
  loginIdentifier?: string;
  password?: string;
  general?: string;
};

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};

  if (!values.loginIdentifier || values.loginIdentifier.trim() === "") {
    errors.loginIdentifier = "Work email or username is required.";
  }

  if (!values.password || values.password === "") {
    errors.password = "Password is required.";
  }

  return errors;
}

export function roleWorkspace(role: string): string {
  switch (role.toUpperCase()) {
    case "DISPATCHER":
      return "/dispatcher";
    case "LOADER":
      return "/loader";
    case "DRIVER":
      return "/driver";
    case "STORE_MANAGER":
      return "/dispatcher";
    default:
      return "/dispatcher";
  }
}
