import { useState } from "react";
import { Link } from "wouter";
import {
  useListTasks,
  useListProjects,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckSquare, Clock, AlertCircle, Filter, ArrowRight } from "lucide-react";
import { format, isPast } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200 shrink-0">Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200 shrink-0">In Progress</Badge>;
  return <Badge variant="outline" className="shrink-0">Pending</Badge>;
}

export default function TasksPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: projects } = useListProjects();
  const { data: tasks, isLoading } = useListTasks(
    {
      ...(statusFilter !== "all" ? { status: statusFilter as "pending" | "in_progress" | "completed" } : {}),
      ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
      ...(user?.role === "member" ? { assignedUserId: user.id } : {}),
    },
    {
      query: {
        queryKey: getListTasksQueryKey({
          ...(statusFilter !== "all" ? { status: statusFilter as "pending" | "in_progress" | "completed" } : {}),
          ...(projectFilter !== "all" ? { projectId: projectFilter } : {}),
        }),
      },
    }
  );

  const filteredTasks = tasks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {user?.role === "member" ? "Your assigned tasks." : "All tasks across projects."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects?.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-lg text-center">
          <CheckSquare className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No tasks found</h3>
          <p className="text-muted-foreground mt-1">Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map(task => {
            const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== "completed";
            return (
              <Link href={`/tasks/${task.id}`} key={task.id}>
                <div className="flex items-center gap-4 p-4 border rounded-lg hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{task.title}</p>
                      {isOverdue && (
                        <span className="flex items-center gap-1 text-xs text-red-500 font-medium shrink-0">
                          <AlertCircle className="w-3 h-3" />
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {task.project?.name && (
                        <span className="font-medium text-foreground/70">{task.project.name}</span>
                      )}
                      {task.assignedUser && (
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-secondary inline-flex items-center justify-center text-[10px] font-bold shrink-0">
                            {task.assignedUser.name.charAt(0)}
                          </span>
                          {task.assignedUser.name}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500" : ""}`}>
                          <Clock className="w-3 h-3" />
                          {format(new Date(task.dueDate), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={task.status} />
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
