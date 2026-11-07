import { User, RegistrationData, LoginCredentials, VerificationData, ProfanityFilter } from "@demoshop/shared-types";
import { AppError } from "../error/AppError";

export const validateRegistrationInput = (userData: RegistrationData): void => {
  const { email, password, confirmPassword, firstName, lastName, username } = userData as any;

  if (!email || !password || !confirmPassword || !firstName || !lastName) {
    throw new AppError("All fields are required.", 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError("Invalid email format.", 400);
  }

  const nameRegex = /^[a-zA-Z\s]+$/;
  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    throw new AppError("First and Last Name must contain only letters and spaces.", 400);
  }

  const filter = ProfanityFilter.getInstance();
  const firstNameCheck = filter.checkText(firstName);
  if (!firstNameCheck.isValid) {
    throw new AppError(`First name contains inappropriate words ("${firstNameCheck.foundWord}").`, 400);
  }

  const lastNameCheck = filter.checkText(lastName);
  if (!lastNameCheck.isValid) {
    throw new AppError(`Last name contains inappropriate words ("${lastNameCheck.foundWord}").`, 400);
  }

  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match.", 400);
  }

  if (username) {
    validateUsername(username);
  }
};


export const validateUsername = (username: string): void => {
  if (!username) {
    throw new AppError("Username is required.", 400);
  }
  const result = ProfanityFilter.getInstance().validateUsername(username);
  if (!result.isValid) {
    throw new AppError(result.reason || "Username contains inappropriate words.", 400);
  }
};

export const validateLoginInput = (credentials: LoginCredentials): void => {
  const { email, password } = credentials;
  if (!email || !password) {
    throw new AppError("Email and password are required.", 400);
  }
};

export const ensureUserUnverified = (user: Partial<User> | null): void => {
  if (user && user.is_verified) {
    throw new AppError("User is already verified.", 400);
  }
};

export const validateVerificationInput = (data: VerificationData): void => {
  const { email, code } = data;
  if (!email || !code) {
    throw new AppError("Email and code are required for verification.", 400);
  }
};

