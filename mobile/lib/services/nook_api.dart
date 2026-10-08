import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as socket_io;

const nookApiUrl = String.fromEnvironment(
  'NOOK_API_URL',
  defaultValue: 'http://10.0.2.2:3000',
);

class NookApiException implements Exception {
  const NookApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class NookApi {
  NookApi({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;
  String? token;

  void setToken(String? value) => token = value;

  Future<dynamic> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final uri = Uri.parse('$nookApiUrl$path').replace(queryParameters: query);
    final request = http.Request(method, uri)
      ..headers.addAll({
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        if (body != null) 'Content-Type': 'application/json',
      });
    if (body != null) request.body = jsonEncode(body);
    final response = await http.Response.fromStream(await _client.send(request));
    dynamic data;
    try {
      data = jsonDecode(response.body);
    } on FormatException {
      data = null;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final message = data is Map ? data['message'] : null;
      throw NookApiException(message is String
          ? message
          : 'Request failed (${response.statusCode})');
    }
    return data;
  }

  Future<Map<String, dynamic>> login(String email, String password) async =>
      Map<String, dynamic>.from(await _request('/api/users/login',
          method: 'POST', body: {'email': email, 'password': password}) as Map);

  Future<Map<String, dynamic>> register(
          String username, String email, String password) async =>
      Map<String, dynamic>.from(await _request('/api/users/register',
          method: 'POST',
          body: {'username': username, 'email': email, 'password': password}) as Map);

  Future<Map<String, dynamic>> getProfile() async =>
      Map<String, dynamic>.from(await _request('/api/users/me') as Map);

  Future<List<Map<String, dynamic>>> getConversations() async =>
      List<Map<String, dynamic>>.from((await _request('/api/conversations') as List)
          .map((item) => Map<String, dynamic>.from(item as Map)));

  Future<List<Map<String, dynamic>>> searchUsers(String query) async =>
      List<Map<String, dynamic>>.from((await _request('/api/users/search',
                  query: {'q': query}) as List)
              .map((item) => Map<String, dynamic>.from(item as Map)));

  Future<Map<String, dynamic>> createDirectConversation(String userId) async =>
      Map<String, dynamic>.from(await _request('/api/conversations',
          method: 'POST',
          body: {'type': 'direct', 'participants': [userId]}) as Map);

  Future<List<Map<String, dynamic>>> getMessages(String conversationId) async =>
      List<Map<String, dynamic>>.from((await _request(
                  '/api/conversations/$conversationId/messages',
                  query: {'limit': '100'}) as List)
              .map((item) => Map<String, dynamic>.from(item as Map)));

  Future<Map<String, dynamic>> sendMessage(
          String conversationId, String content) async =>
      Map<String, dynamic>.from(await _request(
          '/api/conversations/$conversationId/messages',
          method: 'POST',
          body: {'content': content}) as Map);

  socket_io.Socket connectSocket() => socket_io.io(
        nookApiUrl,
        <String, dynamic>{
          'transports': ['websocket'],
          'autoConnect': false,
          'auth': {'token': token},
        },
      )..connect();
}