import { Router, type IRouter } from "express";
import mongoose from "mongoose";
import { Task, Project, User } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function getAccessibleProjectIds(userId: string, role: string): Promise<mongoose.Types.ObjectId[]> {
  if (role === "admin") {
    const projects = await Project.find({}, { _id: 1 }).lean();
    return projects.map(p => p._id);
  } else {
    const projects = await Project.find(
      { memberIds: new mongoose.Types.ObjectId(userId) },
      { _id: 1 }
    ).lean();
    return projects.map(p => p._id);
  }
}

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const role = req.user!.role;

  const projectIds = await getAccessibleProjectIds(userId, role);
  const now = new Date();

  const tasks = projectIds.length > 0
    ? await Task.find({ projectId: { $in: projectIds } }).lean()
    : [];

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const pendingTasks = tasks.filter(t => t.status === "pending").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const overdueTasks = tasks.filter(t =>
    t.dueDate && (t.dueDate as Date) < now && t.status !== "completed"
  ).length;
  const totalProjects = projectIds.length;

  let totalMembers: number;
  if (role === "admin") {
    totalMembers = await User.countDocuments();
  } else {
    const projectDocs = projectIds.length > 0
      ? await Project.find({ _id: { $in: projectIds } }, { memberIds: 1 }).lean()
      : [];
    const allMemberIds = new Set(projectDocs.flatMap(p => p.memberIds.map(id => id.toString())));
    totalMembers = allMemberIds.size;
  }

  res.json({
    totalTasks,
    completedTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    totalProjects,
    totalMembers,
    tasksByStatus: [
      { status: "pending", count: pendingTasks },
      { status: "in_progress", count: inProgressTasks },
      { status: "completed", count: completedTasks },
    ],
  });
});

router.get("/dashboard/recent-tasks", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const role = req.user!.role;

  const projectIds = await getAccessibleProjectIds(userId, role);

  if (projectIds.length === 0) {
    res.json([]);
    return;
  }

  const tasks = await Task.find({ projectId: { $in: projectIds } })
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  const assignedUserIds = tasks
    .map(t => t.assignedUserId)
    .filter((id): id is mongoose.Types.ObjectId => id != null);
  const pIds = [...new Set(tasks.map(t => t.projectId.toString()))].map(
    id => new mongoose.Types.ObjectId(id)
  );

  const [users, projects, taskCountAgg] = await Promise.all([
    assignedUserIds.length > 0 ? User.find({ _id: { $in: assignedUserIds } }).lean() : [],
    pIds.length > 0 ? Project.find({ _id: { $in: pIds } }).lean() : [],
    pIds.length > 0
      ? Task.aggregate([
          { $match: { projectId: { $in: pIds } } },
          { $group: { _id: "$projectId", count: { $sum: 1 } } },
        ])
      : [],
  ]);

  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
  const projectMap = Object.fromEntries(projects.map(p => [p._id.toString(), p]));
  const taskCountMap = Object.fromEntries(
    taskCountAgg.map((r: { _id: mongoose.Types.ObjectId; count: number }) => [r._id.toString(), r.count])
  );

  res.json(tasks.map(t => {
    const au = t.assignedUserId ? userMap[t.assignedUserId.toString()] : null;
    const proj = projectMap[t.projectId.toString()];
    return {
      id: t._id.toString(),
      title: t.title,
      description: t.description ?? null,
      dueDate: t.dueDate ? (t.dueDate as Date).toISOString() : null,
      status: t.status,
      projectId: t.projectId.toString(),
      assignedUserId: t.assignedUserId?.toString() ?? null,
      assignedUser: au ? {
        id: au._id.toString(),
        name: au.name,
        email: au.email,
        role: au.role,
        createdAt: (au.createdAt as Date).toISOString(),
      } : null,
      project: proj ? {
        id: proj._id.toString(),
        name: proj.name,
        description: proj.description ?? null,
        createdById: proj.createdById.toString(),
        memberCount: proj.memberIds.length,
        taskCount: taskCountMap[proj._id.toString()] ?? 0,
        createdAt: (proj.createdAt as Date).toISOString(),
      } : null,
      createdAt: (t.createdAt as Date).toISOString(),
      updatedAt: (t.updatedAt as Date).toISOString(),
    };
  }));
});

export default router;
