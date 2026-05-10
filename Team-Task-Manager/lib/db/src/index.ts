import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI must be set.");
}

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;
  await mongoose.connect(MONGODB_URI!);
  isConnected = true;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface IUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: "admin" | "member";
  createdAt: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const User = mongoose.models.User
  ? (mongoose.model("User") as mongoose.Model<IUser>)
  : mongoose.model<IUser>("User", userSchema);

// ─── Project ──────────────────────────────────────────────────────────────────

export interface IProject {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string | null;
  createdById: mongoose.Types.ObjectId;
  memberIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new mongoose.Schema<IProject>(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const Project = mongoose.models.Project
  ? (mongoose.model("Project") as mongoose.Model<IProject>)
  : mongoose.model<IProject>("Project", projectSchema);

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface ITask {
  _id: mongoose.Types.ObjectId;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  status: "pending" | "in_progress" | "completed";
  projectId: mongoose.Types.ObjectId;
  assignedUserId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new mongoose.Schema<ITask>(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

export const Task = mongoose.models.Task
  ? (mongoose.model("Task") as mongoose.Model<ITask>)
  : mongoose.model<ITask>("Task", taskSchema);
