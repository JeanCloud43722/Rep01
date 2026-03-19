import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Bell, MessageSquare, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type AppEvent = {
  id: string;
  type: "message" | "service_request" | "order_status" | "order_created" | "order_confirmed";
  orderId: string;
  title: string;
  preview: string;
  timestamp: string; // ISO string
  read: boolean;
  meta?: Record<string, any>;
};

function getEventIcon(type: AppEvent["type"]) {
  switch (type) {
    case "service_request":
      return <AlertCircle className="h-4 w-4" />;
    case "message":
      return <MessageSquare className="h-4 w-4" />;
    case "order_status":
    case "order_confirmed":
      return <CheckCircle className="h-4 w-4" />;
    case "order_created":
      return <Bell className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function getEventIconBg(type: AppEvent["type"]) {
  switch (type) {
    case "service_request":
      return "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400";
    case "message":
      return "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400";
    case "order_confirmed":
      return "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }
}

export function ActivityFeed({
  isOpen,
  onOpenChange,
  events,
  onEventClick,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  events: AppEvent[];
  onEventClick: (event: AppEvent) => void;
}) {
  const unreadCount = events.filter((e) => !e.read).length;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Activity Feed
            </SheetTitle>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-500 text-white text-xs font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {events.length === 0 ? "No activity yet" : `${unreadCount} unread · ${events.length} total`}
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {events.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
              <Bell className="h-8 w-8 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            <ul className="divide-y">
              {events.slice(0, 50).map((event) => (
                <li
                  key={event.id}
                  className={`p-4 hover:bg-accent cursor-pointer transition-colors border-l-2 ${
                    !event.read ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-l-transparent"
                  }`}
                  onClick={() => {
                    onEventClick(event);
                  }}
                  data-testid={`activity-event-${event.id}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon by event type */}
                    <div className={`p-2 rounded-full flex-shrink-0 ${getEventIconBg(event.type)}`}>
                      {getEventIcon(event.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-medium text-sm truncate">{event.title}</p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">{event.preview}</p>
                      {!event.read && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mt-2" />}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {/* Footer */}
        {events.length > 0 && (
          <div className="p-4 border-t flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                // In a future version, could add "clear all" functionality
              }}
              data-testid="button-clear-activity"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
