import { describe, expect, it } from "vitest";
import { calendarOptions, calendarEventInput } from "./RomikuCalendar";

describe("visual calendar configuration", () => {
  it("uses a Monday-first month grid with month/week/day controls and overflow", () => {
    expect(calendarOptions.initialView).toBe("dayGridMonth");
    expect(calendarOptions.firstDay).toBe(1);
    expect(calendarOptions.headerToolbar).toMatchObject({
      left: "prev,next today",
      right: "dayGridMonth,timeGridWeek,timeGridDay",
    });
    expect(calendarOptions.dayMaxEvents).toBe(true);
    expect(calendarOptions.locale).toBe("zh-cn");
  });

  it("maps all-day and timed source events without changing their source link", () => {
    expect(
      calendarEventInput({
        id: "task-1",
        title: "Follow up",
        source_table: "romiku_manual_tasks",
        source_id: "task-1",
        due_at: "2026-09-22T10:30:00.000Z",
      } as never),
    ).toMatchObject({
      id: "task-1",
      title: "Follow up",
      url: "/calendar/tasks/task-1",
      allDay: false,
    });
  });
});
