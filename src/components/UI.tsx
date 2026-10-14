import type { ReactNode } from "react";
import { X, LoaderCircle, ArrowUpRight } from "lucide-react";
export function Button({
  children,
  onClick,
  kind = "primary",
  disabled = false,
  type = "button",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  return (
    <button
      {...rest}
      type={type}
      className={"button " + kind + " " + (rest.className || "")}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"card " + className}>{children}</section>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow || "KHÔNG GIAN CỦA BẠN"}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Đóng" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  message = "Chưa có dữ liệu. Hãy tạo nội dung đầu tiên.",
}: {
  message?: string;
}) {
  return (
    <div className="empty">
      <ArrowUpRight size={28} />
      <p>{message}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="empty">
      <LoaderCircle className="loading" /> Đang tải…
    </div>
  );
}
export function Unavailable({
  title,
  reason,
}: {
  title: string;
  reason: string;
}) {
  return (
    <>
      <PageTitle title={title} />
      <Card>
        <h2>Chưa sẵn sàng</h2>
        <p>{reason}</p>
        <p>Không có dữ liệu giả được ghi vào hệ thống.</p>
      </Card>
    </>
  );
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Thao tác thất bại. Kiểm tra kết nối và thử lại.";
}
