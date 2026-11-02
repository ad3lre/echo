import EchoDomain
import SwiftUI

/// Sidebar / sheet list of paper comments (web floating comments, panel form).
struct EchoPaperCommentsPanel: View {
  @Bindable var model: EchoPaperCommentsModel
  var onClose: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      header
      Divider().opacity(0.35)
      content
      if model.canComment {
        composer
      }
    }
    .background(EchoTheme.Color.elevatedDeep)
    .task { await model.reload() }
  }

  private var header: some View {
    HStack {
      Text(EchoCopy.string("Comments"))
        .font(.system(size: 16, weight: .bold, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(0.94))
      Spacer()
      if model.isLoading || model.isMutating {
        ProgressView().controlSize(.small)
      }
      Button(action: onClose) {
        Image(systemName: "xmark")
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          .frame(width: 28, height: 28)
          .background(EchoTheme.Color.ink(0.08), in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(EchoCopy.string("Close"))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
  }

  @ViewBuilder
  private var content: some View {
    if model.loadForbidden {
      placeholder(EchoCopy.string("You don’t have access to comments on this paper."))
    } else if let error = model.errorMessage, model.comments.isEmpty {
      placeholder(error)
    } else if model.isLoading && model.comments.isEmpty {
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if model.topLevel.isEmpty {
      placeholder(EchoCopy.string("No comments yet."))
    } else {
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 12) {
          ForEach(model.topLevel) { comment in
            thread(comment)
          }
        }
        .padding(14)
      }
    }
  }

  private func thread(_ comment: EchoPaperComment) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      commentCard(comment)
      ForEach(model.replies(for: comment.id)) { reply in
        commentCard(reply)
          .padding(.leading, 14)
      }
      if model.canComment {
        if model.replyParentID == comment.id {
          VStack(alignment: .leading, spacing: 6) {
            TextField(EchoCopy.string("Write a reply…"), text: Bindable(model).replyDraft, axis: .vertical)
              .textFieldStyle(.plain)
              .font(.system(size: 13, design: .rounded))
              .padding(8)
              .background(
                EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            HStack {
              Button(EchoCopy.string("Cancel")) {
                model.replyParentID = nil
                model.replyDraft = ""
              }
              .buttonStyle(.plain)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.ink(0.5))
              Spacer()
              Button(EchoCopy.string("Reply")) {
                Task { await model.addReply(to: comment) }
              }
              .buttonStyle(.plain)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(EchoTheme.Color.signInBlue)
              .disabled(
                model.isMutating
                  || model.replyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
          }
          .padding(.leading, 14)
        } else {
          Button(EchoCopy.string("Reply")) {
            model.replyParentID = comment.id
            model.replyDraft = ""
          }
          .buttonStyle(.plain)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.signInBlue)
          .padding(.leading, 14)
        }
      }
    }
  }

  private func commentCard(_ comment: EchoPaperComment) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(comment.authorID)
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(EchoTheme.Color.ink(0.72))
          .lineLimit(1)
        if comment.isResolved {
          Text(EchoCopy.string("Resolved"))
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .foregroundStyle(EchoTheme.Color.presenceOnline)
        }
        Spacer(minLength: 0)
      }
      if !comment.anchorQuote.isEmpty {
        Text(comment.anchorQuote)
          .font(.system(size: 12, design: .rounded).italic())
          .foregroundStyle(EchoTheme.Color.ink(0.48))
          .lineLimit(3)
      }
      Text(comment.body)
        .font(.system(size: 14, design: .rounded))
        .foregroundStyle(EchoTheme.Color.ink(comment.isResolved ? 0.55 : 0.9))
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 12) {
        if model.canManage || EchoUserIdentity.matches(model.currentUserID, comment.authorID) {
          Button {
            Task { await model.toggleResolved(comment) }
          } label: {
            Text(EchoCopy.string(comment.isResolved ? "Unresolve" : "Resolve"))
          }
          .buttonStyle(.plain)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.ink(0.55))
          Button(role: .destructive) {
            Task { await model.remove(comment) }
          } label: {
            Text(EchoCopy.string("Delete"))
          }
          .buttonStyle(.plain)
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(EchoTheme.Color.mentionPing)
        }
      }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      EchoTheme.Color.ink(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .opacity(comment.isResolved ? 0.85 : 1)
  }

  private var composer: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let error = model.errorMessage, !model.comments.isEmpty {
        Text(error)
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(EchoTheme.Color.mentionPing)
      }
      TextField(EchoCopy.string("Add a comment…"), text: Bindable(model).draft, axis: .vertical)
        .textFieldStyle(.plain)
        .font(.system(size: 14, design: .rounded))
        .padding(10)
        .background(
          EchoTheme.Color.ink(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      HStack {
        Spacer()
        Button(EchoCopy.string("Comment")) {
          Task { await model.addComment() }
        }
        .buttonStyle(.borderedProminent)
        .disabled(
          model.isMutating || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
    .padding(14)
    .background(EchoTheme.Color.elevatedMid.opacity(0.6))
  }

  private func placeholder(_ text: String) -> some View {
    Text(text)
      .font(.system(size: 13, design: .rounded))
      .foregroundStyle(EchoTheme.Color.ink(0.5))
      .multilineTextAlignment(.center)
      .padding(24)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
