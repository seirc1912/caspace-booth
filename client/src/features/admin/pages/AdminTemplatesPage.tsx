import { useMemo, useState } from "react";
import { usePathname } from "../../../hooks/usePathname";
import { useAdminTemplates } from "../store/AdminTemplateContext";
import { useRooms } from "../store/RoomContext";
import type { TemplateStatus } from "../types";
import type { AdminTemplateSummary } from "../types";
import { parseTemplatePosition } from "../model/templateOrder";

const updatedTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AdminTemplatesPage() {
  const store = useAdminTemplates();
  const { rooms } = useRooms();
  const { navigate } = usePathname();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TemplateStatus>("all");
  const [roomId, setRoomId] = useState("all");
  const [sort, setSort] = useState<"order" | "updated" | "name">("order");
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const roomOrder = useMemo(() => new Map(rooms.map((room, index) => [room.id, index])), [rooms]);
  const records = useMemo(
    () =>
      store.templates
        .filter(
          (record) =>
            record.name.toLowerCase().includes(query.toLowerCase()) &&
            (status === "all" || record.status === status) &&
            (roomId === "all" || record.roomId === roomId),
        )
        .sort((a, b) =>
          sort === "order"
            ? (roomOrder.get(a.roomId) ?? Number.MAX_SAFE_INTEGER) - (roomOrder.get(b.roomId) ?? Number.MAX_SAFE_INTEGER) || a.displayOrder - b.displayOrder
            : sort === "name"
            ? a.name.localeCompare(b.name)
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [query, roomId, roomOrder, sort, status, store.templates],
  );
  const rename = (id: string) => {
    const source = store.templates.find((item) => item.id === id);
    const name = source && window.prompt("Template name", source.name)?.trim();
    if (source && name) void store.loadDetail(id).then((detail) => store.save({ ...detail, updatedAt: new Date().toISOString(), template: { ...detail.template, name } })).catch(showError);
  };
  const assignRoom = (id: string, nextRoomId: string) => {
    const source = store.templates.find((item) => item.id === id);
    if (source) void store.loadDetail(id).then((detail) => store.save({ ...detail, roomId: nextRoomId, updatedAt: new Date().toISOString() })).catch(showError);
  };
  const showError = (error: unknown) => window.alert(error instanceof Error ? error.message : 'The template operation failed.')
  const savePosition = async (record: AdminTemplateSummary, value: string) => {
    const roomSize = store.templates.filter((template) => template.roomId === record.roomId).length;
    const position = parseTemplatePosition(value, roomSize);
    if (position === null) throw new Error(`Order must be a whole number from 1 to ${roomSize}.`);
    if (position === record.displayOrder) return;
    setSavingOrderId(record.id);
    try { await store.reorder(record.id, position); }
    finally { setSavingOrderId(null); }
  };

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="mt-1 text-stone-500">
            Create, organize, publish, and maintain print layouts.
          </p>
        </div>
        <button
        className="min-h-12 rounded-xl bg-stone-950 px-5 font-semibold text-white"
          onClick={() => navigate("/admin/templates/new")}
          type="button"
        >
          + Create Template
        </button>
      </header>
      <div className="mt-6 grid gap-2 rounded-2xl bg-white p-3 shadow-sm sm:grid-cols-4">
        <input
          aria-label="Search templates"
          className="min-h-11 rounded-xl border border-stone-200 px-3 text-sm"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search templates…"
          value={query}
        />
        <select
          aria-label="Filter by status"
          className="min-h-11 rounded-xl border border-stone-200 px-3 text-sm"
          onChange={(event) => setStatus(event.target.value as typeof status)}
          value={status}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          aria-label="Filter by room"
          className="min-h-11 rounded-xl border border-stone-200 px-3 text-sm"
          onChange={(event) => setRoomId(event.target.value)}
          value={roomId}
        >
          <option value="all">All rooms</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort templates"
          className="min-h-11 rounded-xl border border-stone-200 px-3 text-sm"
          onChange={(event) => setSort(event.target.value as typeof sort)}
          value={sort}
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name A–Z</option>
          <option value="order">Display order</option>
        </select>
      </div>
      {records.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-dashed border-stone-300 p-12 text-center text-stone-500">
          No templates match these filters.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => {
            const roomSize = store.templates.filter((item) => item.roomId === record.roomId).length;
            return (
              <article
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
                key={record.id}
              >
                <div className="grid aspect-[16/9] place-items-center bg-stone-100">
                  {record.thumbnailUrl ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={record.thumbnailUrl}
                    />
                  ) : (
                    <span className="text-sm text-stone-400">No cover</span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold">{record.name}</h2>
                      <p className="mt-1 text-xs text-stone-500">
                        {record.category} · {record.slotCount}{" "}
                        slots
                      </p>
                      <p className="mt-1 text-[11px] text-stone-400">
                        Updated {updatedTime.format(new Date(record.updatedAt))}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${record.status === "published" ? "bg-emerald-100 text-emerald-700" : record.status === "archived" ? "bg-stone-200 text-stone-500" : "bg-amber-100 text-amber-700"}`}
                    >
                      {record.status}
                    </span>
                  </div>
                  <select
                    aria-label={`Room for ${record.name}`}
                    className="mt-3 min-h-10 w-full rounded-lg border border-stone-200 px-2 text-xs"
                    onChange={(event) =>
                      assignRoom(record.id, event.target.value)
                    }
                    value={record.roomId}
                  >
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                  <TemplateOrderInput disabled={savingOrderId === record.id} key={`${record.id}:${record.displayOrder}`} onSave={(value) => savePosition(record, value)} record={record} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className="min-h-10 rounded-lg bg-stone-950 text-sm font-semibold text-white"
                      onClick={() => navigate(`/admin/templates/${record.id}`)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      onClick={() => rename(record.id)}
                      type="button"
                    >
                      Rename
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      onClick={() => { void store.duplicate(record.id).catch(showError) }}
                      type="button"
                    >
                      Duplicate
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      onClick={() => { void store.setStatus(
                          record.id,
                          record.status === "published" ? "draft" : "published",
                        ).catch(showError) }}
                      type="button"
                    >
                      {record.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      disabled={savingOrderId === record.id || record.displayOrder <= 1}
                      onClick={() => { void store.reorder(record.id, record.displayOrder - 1).catch(showError) }}
                      type="button"
                    >
                      Move up
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      disabled={savingOrderId === record.id || record.displayOrder >= roomSize}
                      onClick={() => { void store.reorder(record.id, record.displayOrder + 1).catch(showError) }}
                      type="button"
                    >
                      Move down
                    </button>
                    <button
                      className="min-h-10 rounded-lg bg-stone-100 text-sm font-semibold"
                      onClick={() => { void store.setStatus(record.id, "archived").catch(showError) }}
                      type="button"
                    >
                      Archive
                    </button>
                    <button
                      className="min-h-10 rounded-lg text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      onClick={() => {
                        if (window.confirm(`Delete ${record.name}?`))
                          void store.remove(record.id).catch(showError);
                      }}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplateOrderInput({ disabled, onSave, record }: { disabled: boolean; onSave: (value: string) => Promise<void>; record: AdminTemplateSummary }) {
  const [value, setValue] = useState(String(record.displayOrder));
  const commit = async () => {
    try { await onSave(value); }
    catch (error) { setValue(String(record.displayOrder)); window.alert(error instanceof Error ? error.message : 'Template order could not be saved.'); }
  };
  return <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-stone-600">Order<input aria-label={`Order for ${record.name}`} className="min-h-10 w-20 rounded-lg border border-stone-200 px-3 text-sm" disabled={disabled} inputMode="numeric" min="1" onBlur={() => void commit()} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} step="1" type="number" value={value} /></label>;
}
