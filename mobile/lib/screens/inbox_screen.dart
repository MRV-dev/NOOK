import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import 'package:video_player/video_player.dart';

import '../services/nook_api.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({
    super.key,
    required this.api,
    required this.userId,
    required this.onSignOut,
    required this.themeMode,
    required this.onThemeModeChanged,
  });

  final NookApi api;
  final String userId;
  final VoidCallback onSignOut;
  final ThemeMode themeMode;
  final ValueChanged<ThemeMode> onThemeModeChanged;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  late final socket_io.Socket _socket;
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _conversations = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _socket = widget.api.connectSocket();
    _socket.on('conversation:updated', (_) => _loadConversations());
    _socket.on('conversation:hidden', (_) => _loadConversations());
    _socket.on('message:notification', (_) => _loadConversations());
    _loadConversations();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _socket.dispose();
    super.dispose();
  }

  Future<void> _loadConversations() async {
    try {
      final conversations = await widget.api.getConversations();
      if (!mounted) return;
      setState(() {
        _conversations = conversations;
        _loading = false;
        _error = null;
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  String _conversationName(Map<String, dynamic> conversation) {
    if (conversation['type'] == 'group') {
      final name = conversation['name']?.toString().trim() ?? '';
      return name.isEmpty ? 'Group conversation' : name;
    }
    final participants = (conversation['participants'] as List? ?? [])
        .whereType<Map>()
        .map((person) => Map<String, dynamic>.from(person))
        .toList();
    final other = participants.firstWhere(
      (person) => (person['id'] ?? person['_id'])?.toString() != widget.userId,
      orElse: () => <String, dynamic>{},
    );
    return other['username']?.toString() ?? 'Conversation';
  }

  Future<void> _startConversation() async {
    final conversation = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      builder: (_) => NewConversationSheet(api: widget.api),
    );
    if (conversation != null && mounted) {
      await _loadConversations();
      _openConversation(conversation);
    }
  }

  void _openConversation(Map<String, dynamic> conversation) {
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => ChatScreen(
              api: widget.api,
              socket: _socket,
              userId: widget.userId,
              conversation: conversation,
              title: _conversationName(conversation),
            ),
          ),
        )
        .then((_) => _loadConversations());
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final query = _searchController.text.trim().toLowerCase();
    final conversations = _conversations
        .where((item) => _conversationName(item).toLowerCase().contains(query))
        .toList();
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 22,
        title: Text(
          'NOOK',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 17,
            letterSpacing: 1.1,
            color: colors.onSurface,
          ),
        ),
        actions: [
          PopupMenuButton<ThemeMode>(
            tooltip: 'Appearance',
            initialValue: widget.themeMode,
            onSelected: widget.onThemeModeChanged,
            icon: Icon(
              widget.themeMode == ThemeMode.dark
                  ? Icons.dark_mode_outlined
                  : widget.themeMode == ThemeMode.light
                  ? Icons.light_mode_outlined
                  : Icons.brightness_auto_outlined,
            ),
            itemBuilder: (context) => [
              for (final mode in ThemeMode.values)
                PopupMenuItem(
                  value: mode,
                  child: Text(switch (mode) {
                    ThemeMode.system => 'System',
                    ThemeMode.light => 'Light',
                    ThemeMode.dark => 'Dark',
                  }),
                ),
            ],
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: widget.onSignOut,
            icon: const Icon(Icons.logout_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 18),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Your corner',
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(
                                color: colors.onSurface,
                                fontWeight: FontWeight.w800,
                                height: 1.1,
                              ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '${_conversations.length} conversations',
                          style: TextStyle(color: colors.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filled(
                    tooltip: 'Start a conversation',
                    style: IconButton.styleFrom(
                      backgroundColor: colors.primary,
                      foregroundColor: colors.onPrimary,
                      fixedSize: const Size(48, 48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(15),
                      ),
                    ),
                    onPressed: _startConversation,
                    icon: const Icon(Icons.edit_square),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 22),
              child: TextField(
                controller: _searchController,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  hintText: 'Search conversations',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _conversations.isEmpty
                  ? _StatusMessage(
                      message: _error!,
                      actionLabel: 'Try again',
                      onAction: _loadConversations,
                    )
                  : conversations.isEmpty
                  ? _StatusMessage(
                      message: query.isEmpty
                          ? 'A good conversation starts here.'
                          : 'No conversations match that search.',
                      actionLabel: query.isEmpty ? 'Start a chat' : null,
                      onAction: query.isEmpty ? _startConversation : null,
                    )
                  : RefreshIndicator(
                      onRefresh: _loadConversations,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
                        itemCount: conversations.length,
                        separatorBuilder: (_, index) => Divider(
                          height: 1,
                          indent: 78,
                          color: colors.outlineVariant,
                        ),
                        itemBuilder: (context, index) {
                          final conversation = conversations[index];
                          final lastMessage = conversation['lastMessage'] is Map
                              ? Map<String, dynamic>.from(
                                  conversation['lastMessage'] as Map,
                                )
                              : null;
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10,
                              vertical: 7,
                            ),
                            leading: _Avatar(
                              name: _conversationName(conversation),
                              group: conversation['type'] == 'group',
                              size: 50,
                            ),
                            title: Text(
                              _conversationName(conversation),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 5),
                              child: Text(
                                lastMessage?['content']?.toString() ??
                                    'Say hello',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: colors.onSurfaceVariant,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                            trailing: lastMessage == null
                                ? null
                                : Text(
                                    _shortTime(lastMessage['createdAt']),
                                    style: TextStyle(
                                      color: colors.onSurfaceVariant,
                                      fontSize: 11,
                                    ),
                                  ),
                            onTap: () => _openConversation(conversation),
                          );
                        },
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class NewConversationSheet extends StatefulWidget {
  const NewConversationSheet({super.key, required this.api});
  final NookApi api;
  @override
  State<NewConversationSheet> createState() => _NewConversationSheetState();
}

class _NewConversationSheetState extends State<NewConversationSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<Map<String, dynamic>> _results = [];
  bool _searching = false;
  bool _creating = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _search(String value) {
    _debounce?.cancel();
    final query = value.trim();
    if (query.length < 2) {
      setState(() {
        _results = [];
        _searching = false;
        _error = null;
      });
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final results = await widget.api.searchUsers(query);
        if (mounted) setState(() => _results = results);
      } on Object catch (error) {
        if (mounted) setState(() => _error = error.toString());
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  Future<void> _selectUser(Map<String, dynamic> user) async {
    final id = (user['id'] ?? user['_id'])?.toString();
    if (id == null) return;
    setState(() => _creating = true);
    try {
      final conversation = await widget.api.createDirectConversation(id);
      if (mounted) Navigator.of(context).pop(conversation);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString();
          _creating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      22,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'New conversation',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            onChanged: _search,
            decoration: const InputDecoration(
              hintText: 'Find someone by name or email',
              prefixIcon: Icon(Icons.search),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
          if (_creating || _searching)
            const LinearProgressIndicator(minHeight: 2),
          if (_results.isNotEmpty)
            SizedBox(
              height: 280,
              child: ListView.builder(
                itemCount: _results.length,
                itemBuilder: (context, index) {
                  final user = _results[index];
                  final name = user['username']?.toString() ?? 'NOOK member';
                  return ListTile(
                    leading: _Avatar(name: name, size: 42),
                    title: Text(name),
                    enabled: !_creating,
                    onTap: () => _selectUser(user),
                  );
                },
              ),
            )
          else if (_controller.text.trim().length >= 2 && !_searching)
            Padding(
              padding: const EdgeInsets.only(top: 18),
              child: Text(
                'No people found.',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.api,
    required this.socket,
    required this.userId,
    required this.conversation,
    required this.title,
  });
  final NookApi api;
  final socket_io.Socket socket;
  final String userId;
  final Map<String, dynamic> conversation;
  final String title;
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  static const _maxMediaFiles = 8;
  static const _maxMediaFileSize = 25 * 1024 * 1024;

  final _imagePicker = ImagePicker();
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  List<XFile> _selectedMedia = [];
  late final String _conversationId;
  late final void Function(dynamic) _onMessage;
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _conversationId = (widget.conversation['id'] ?? widget.conversation['_id'])
        .toString();
    _onMessage = (dynamic value) {
      if (value is Map) _addMessage(Map<String, dynamic>.from(value));
    };
    widget.socket.on('message:new', _onMessage);
    widget.socket.emit('conversation:join', {
      'conversationId': _conversationId,
    });
    _loadMessages();
  }

  @override
  void dispose() {
    widget.socket.off('message:new', _onMessage);
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    try {
      final messages = await widget.api.getMessages(_conversationId);
      if (!mounted) return;
      setState(() {
        _messages = messages;
        _loading = false;
        _error = null;
      });
      _scrollToLatest();
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString();
      });
    }
  }

  void _addMessage(Map<String, dynamic> message) {
    final conversation = message['conversation'];
    final id = (conversation is Map ? conversation['_id'] : conversation)
        ?.toString();
    if (id != _conversationId) return;
    final messageId = (message['id'] ?? message['_id'])?.toString();
    if (_messages.any(
      (item) =>
          messageId != null &&
          (item['id'] ?? item['_id'])?.toString() == messageId,
    )) {
      return;
    }
    setState(() => _messages = [..._messages, message]);
    _scrollToLatest();
  }

  void _scrollToLatest() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _pickMedia() async {
    final remainingSlots = _maxMediaFiles - _selectedMedia.length;
    if (remainingSlots <= 0) {
      _showMediaError('You can attach up to 8 files per message');
      return;
    }

    try {
      final files = await _imagePicker.pickMultipleMedia(limit: remainingSlots);
      if (!mounted || files.isEmpty) return;

      final acceptedFiles = <XFile>[];
      for (final file in files) {
        if (nookMediaMimeType(file) == null) {
          _showMediaError('${file.name} is not a supported image or video');
          continue;
        }
        if (await file.length() > _maxMediaFileSize) {
          _showMediaError('${file.name} is larger than 25 MB');
          continue;
        }
        acceptedFiles.add(file);
      }
      if (acceptedFiles.isNotEmpty && mounted) {
        setState(() => _selectedMedia = [..._selectedMedia, ...acceptedFiles]);
      }
    } on Object catch (error) {
      if (mounted) _showMediaError(error.toString());
    }
  }

  void _showMediaError(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _removeMedia(int index) {
    setState(() => _selectedMedia.removeAt(index));
  }

  Future<void> _sendMessage() async {
    final content = _messageController.text.trim();
    if ((content.isEmpty && _selectedMedia.isEmpty) || _sending) return;
    setState(() => _sending = true);
    try {
      final message = _selectedMedia.isEmpty
          ? await widget.api.sendMessage(_conversationId, content)
          : await widget.api.sendMediaMessage(
              _conversationId,
              _selectedMedia,
              content: content,
            );
      if (mounted) {
        _messageController.clear();
        setState(() => _selectedMedia = []);
        _addMessage(message);
      }
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: IconButton(
        tooltip: 'Back to conversations',
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back_rounded),
      ),
      titleSpacing: 0,
      title: Row(
        children: [
          _Avatar(
            name: widget.title,
            group: widget.conversation['type'] == 'group',
            size: 38,
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Text(
              widget.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
            ),
          ),
        ],
      ),
    ),
    body: Column(
      children: [
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null && _messages.isEmpty
              ? _StatusMessage(
                  message: _error!,
                  actionLabel: 'Try again',
                  onAction: _loadMessages,
                )
              : _messages.isEmpty
              ? const _StatusMessage(
                  message: 'This is the start of something good.',
                )
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(16, 18, 16, 20),
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final message = _messages[index];
                    final sender = message['sender'] is Map
                        ? Map<String, dynamic>.from(message['sender'] as Map)
                        : <String, dynamic>{};
                    final senderId = (sender['id'] ?? sender['_id'])
                        ?.toString();
                    final mine = senderId == widget.userId;
                    final attachments = _messageAttachments(message);
                    if (message['kind'] == 'system' ||
                        message['kind'] == 'call') {
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Center(
                          child: Text(
                            message['content']?.toString() ?? '',
                            style: TextStyle(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      );
                    }
                    return Align(
                      alignment: mine
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.sizeOf(context).width * .78,
                        ),
                        margin: const EdgeInsets.symmetric(vertical: 5),
                        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
                        decoration: BoxDecoration(
                          color: mine
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(17),
                            topRight: const Radius.circular(17),
                            bottomLeft: Radius.circular(mine ? 17 : 5),
                            bottomRight: Radius.circular(mine ? 5 : 17),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (!mine &&
                                widget.conversation['type'] == 'group') ...[
                              Align(
                                alignment: Alignment.centerLeft,
                                child: Text(
                                  sender['username']?.toString() ?? 'Member',
                                  style: TextStyle(
                                    color: Theme.of(
                                      context,
                                    ).colorScheme.primary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 3),
                            ],
                            if (message['isDeleted'] != true)
                              for (final attachment in attachments)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: _MessageAttachment(
                                    url: attachment['url']?.toString() ?? '',
                                    type: attachment['type']?.toString() ?? '',
                                  ),
                                ),
                            Text(
                              message['isDeleted'] == true
                                  ? 'Message removed'
                                  : message['content']?.toString() ?? '',
                              style: TextStyle(
                                color: mine
                                    ? Colors.white
                                    : Theme.of(context).colorScheme.onSurface,
                                height: 1.35,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _shortTime(message['createdAt']),
                              style: TextStyle(
                                color: mine
                                    ? Colors.white70
                                    : Theme.of(
                                        context,
                                      ).colorScheme.onSurfaceVariant,
                                fontSize: 10,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_selectedMedia.isNotEmpty)
                  SizedBox(
                    height: 78,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _selectedMedia.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final file = _selectedMedia[index];
                        final isVideo =
                            nookMediaMimeType(file)?.startsWith('video/') ??
                            false;
                        return SizedBox(
                          width: 70,
                          height: 70,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: isVideo
                                    ? ColoredBox(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.surfaceContainerHighest,
                                        child: Icon(
                                          Icons.play_circle_outline_rounded,
                                          color: Theme.of(
                                            context,
                                          ).colorScheme.onSurfaceVariant,
                                          size: 34,
                                        ),
                                      )
                                    : Image.file(
                                        File(file.path),
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) => const Icon(
                                          Icons.broken_image_outlined,
                                        ),
                                      ),
                              ),
                              Positioned(
                                top: 0,
                                right: 0,
                                child: IconButton(
                                  tooltip: 'Remove attachment',
                                  onPressed: () => _removeMedia(index),
                                  icon: const Icon(Icons.cancel_rounded),
                                  color: Colors.white,
                                  iconSize: 20,
                                  padding: EdgeInsets.zero,
                                  constraints: const BoxConstraints.tightFor(
                                    width: 26,
                                    height: 26,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                if (_selectedMedia.isNotEmpty) const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    IconButton(
                      tooltip: 'Attach photos or videos',
                      onPressed: _sending ? null : _pickMedia,
                      icon: const Icon(Icons.add_photo_alternate_outlined),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _messageController,
                        minLines: 1,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        onSubmitted: (_) => _sendMessage(),
                        decoration: const InputDecoration(
                          hintText: 'Write a message',
                          contentPadding: EdgeInsets.symmetric(
                            horizontal: 17,
                            vertical: 13,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: 'Send message',
                      onPressed: _sending ? null : _sendMessage,
                      style: IconButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Colors.white,
                        fixedSize: const Size(49, 49),
                      ),
                      icon: _sending
                          ? const SizedBox.square(
                              dimension: 19,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.arrow_upward_rounded),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

List<Map<String, dynamic>> _messageAttachments(Map<String, dynamic> message) {
  final media = message['media'];
  if (media is List && media.isNotEmpty) {
    return media.whereType<Map>().map(Map<String, dynamic>.from).toList();
  }
  final mediaUrl = message['mediaUrl']?.toString();
  if (mediaUrl == null || mediaUrl.isEmpty) return [];
  return [
    {'url': mediaUrl, 'type': message['mediaType']},
  ];
}

class _MessageAttachment extends StatelessWidget {
  const _MessageAttachment({required this.url, required this.type});
  final String url;
  final String type;

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * .68;
    if (type == 'video') {
      return SizedBox(
        width: maxWidth,
        child: _InlineVideo(url: url),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: 260),
        child: Image.network(
          url,
          fit: BoxFit.contain,
          loadingBuilder: (context, child, progress) => progress == null
              ? child
              : const SizedBox(
                  height: 150,
                  child: Center(child: CircularProgressIndicator()),
                ),
          errorBuilder: (_, _, _) => const SizedBox(
            height: 120,
            child: Center(child: Icon(Icons.broken_image_outlined)),
          ),
        ),
      ),
    );
  }
}

class _InlineVideo extends StatefulWidget {
  const _InlineVideo({required this.url});
  final String url;

  @override
  State<_InlineVideo> createState() => _InlineVideoState();
}

class _InlineVideoState extends State<_InlineVideo> {
  late final VideoPlayerController _controller;
  late final Future<void> _initialization;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _initialization = _controller.initialize();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: _initialization,
    builder: (context, snapshot) {
      if (snapshot.connectionState != ConnectionState.done) {
        return const SizedBox(
          height: 150,
          child: Center(child: CircularProgressIndicator()),
        );
      }
      if (snapshot.hasError) {
        return const SizedBox(
          height: 120,
          child: Center(child: Icon(Icons.videocam_off_outlined)),
        );
      }
      final aspectRatio = _controller.value.aspectRatio;
      return Column(
        children: [
          AspectRatio(
            aspectRatio: aspectRatio > 0 ? aspectRatio : 16 / 9,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: VideoPlayer(_controller),
            ),
          ),
          Row(
            children: [
              ValueListenableBuilder<VideoPlayerValue>(
                valueListenable: _controller,
                builder: (context, value, _) => IconButton(
                  tooltip: value.isPlaying ? 'Pause video' : 'Play video',
                  onPressed: () => value.isPlaying
                      ? _controller.pause()
                      : _controller.play(),
                  icon: Icon(
                    value.isPlaying
                        ? Icons.pause_rounded
                        : Icons.play_arrow_rounded,
                  ),
                ),
              ),
              Expanded(
                child: VideoProgressIndicator(
                  _controller,
                  allowScrubbing: true,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                ),
              ),
            ],
          ),
        ],
      );
    },
  );
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.group = false, this.size = 44});
  final String name;
  final bool group;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part.characters.first.toUpperCase())
        .join();
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: group
          ? colors.secondaryContainer
          : colors.surfaceContainerHighest,
      foregroundColor: Theme.of(context).brightness == Brightness.dark
          ? colors.secondary
          : colors.primary,
      child: group
          ? const Icon(Icons.groups_2_outlined, size: 21)
          : Text(
              initials.isEmpty ? '?' : initials,
              style: TextStyle(
                fontSize: size * .28,
                fontWeight: FontWeight.w700,
              ),
            ),
    );
  }
}

class _StatusMessage extends StatelessWidget {
  const _StatusMessage({
    required this.message,
    this.actionLabel,
    this.onAction,
  });
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.forum_outlined,
            size: 34,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.45,
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 14),
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    ),
  );
}

String _shortTime(dynamic value) {
  final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (date == null) return '';
  final hour = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final minute = date.minute.toString().padLeft(2, '0');
  return '$hour:$minute ${date.hour < 12 ? 'AM' : 'PM'}';
}
