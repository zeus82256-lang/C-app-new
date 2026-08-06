
#المصدر https://t.me/editortrue
#تم كسر الحماية بواسطة محمود عادل @modedevx
import requests
import json
import time
import uuid
from typing import Optional, Dict, List, Any, Callable

class ChatGPTAndroidClient:
    
    def __init__(self):
        self.base_url = "https://android.chat.openai.com/backend-api"
        
        self.cookies = {
            '_cfuvid': 'NNrDv80LRGgmapjs13x7oRci3PBYFZo6CYpUceU33l8-1784986028.3390262-1.0.1.1-ifd0u.k3_SjmtNYOtuAgtDeOARCALxJlmXHb0HA1Dzc',
            'oai-did': '05d871f5-391c-418a-b1d1-8dc804241915',
            'oaicom-stable-id': '079376db-fc25-4e75-9172-430462cd4822',
            '__cflb': '0H28vqQWtcC5yespLhMiQhAAywCFR8cq5Tg7BqvYTNB',
            'oai-sc': '0gAAAAABqaJ2IWSKe2ZXPUMJJUAjx_StO4_6afA0lduBU7lIv7hdhBUN9nLxFq26v69aTLW5MCDdkSua6bYYmoABo-srtbIlYRn3m45kUYHI00dT3_csiiYbtat-r7hqkEobyRTRDoOAf3lCYxAPqOZSMLmmm1-n_jWbO-3dbZIlTegniEXtwuXUXsmRy76F7ON_RGDMb_BdWIOAaKw4JNp77bta_TwSanjnop6Qusc9HbgcKkWsawGgKipfs8e9q7R3vVpxLdnYE',
            '__cf_bm': 'M88ntOQ6Gu5aXtrwdBHpoJ_0v34T.bZd2DL1AIHoY1w-1785240969.9676516-1.0.1.1-HebHl3gLNOI3W1oTWuENwDIftA4Hx9vNB2HsMK8zSmwBWPjIbYXMnGRZ00344c4B0.bjB2ohfUggTgdk7wSJa.MQLnqR4wqh_uynEZ4g0YvBbQ81nLCIOdUDf1TWNi.X',
        }
        
        self.headers = {
            'host': 'android.chat.openai.com',
            'user-agent': 'ChatGPT/1.2026.195 (Android 15; RMX3834; build 2619512)',
            'oai-package-name': 'com.openai.chatgpt',
            'oai-client-type': 'android',
            'oai-device-id': '05d871f5-391c-418a-b1d1-8dc804241915',
            'accept-language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
            'x-device-tier': 'lower_mid',
            'chatgpt-account-id': '3f96d52f-3061-4ae2-b7f8-3fa72fad07f1',
            'chatgpt-residency-region': 'no_constraint',
            'x-storefront-country-code': 'EG',
            'authorization': 'Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IldjNzdXREtWTkN2N1ZYSGxqZUhzZjZZUjFhM3I3MmxYMnhJdG9zaVF4NHciLCJ0eXAiOiJKV1QifQ.eyJhdWQiOlsiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MSJdLCJjbGllbnRfaWQiOiJhcHBfeHdCS3p0MDQ3NTJUVFNmWG5raTE3aG1CIiwiaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS9hdXRoIjp7ImFtciI6WyJvdHAiLCJ1cm46b3BlbmFpOmFtcjpvdHBfZW1haWwiXSwiY2hhdGdwdF9hY2NvdW50X2lkIjoiM2Y5NmQ1MmYtMzA2MS00YWUyLWI3ZjgtM2ZhNzJmYWQwN2YxIiwiY2hhdGdwdF9hY2NvdW50X3VzZXJfaWQiOiJ1c2VyLUZpVDVtTDh4bkU5MjJkc0k0R0FjdDl4c19fM2Y5NmQ1MmYtMzA2MS00YWUyLWI3ZjgtM2ZhNzJmYWQwN2YxIiwiY2hhdGdwdF9jb21wdXRlX3Jlc2lkZW5jeSI6Im5vX2NvbnN0cmFpbnQiLCJjaGF0Z3B0X3BsYW5fdHlwZSI6ImZyZWUiLCJjaGF0Z3B0X3VzZXJfaWQiOiJ1c2VyLUZpVDVtTDh4bkU5MjJkc0k0R0FjdDl4cyIsInBvaWQiOiJvcmctN3lkUkFpcDdqSjdNb3FOS2ZOZGw2Qm5kIiwidXNlcl9pZCI6InVzZXItRmlUNW1MOHhuRTkyMmRzSTRHQWN0OXhzIn0sImh0dHBzOi8vYXBpLm9wZW5haS5jb20vcHJvZmlsZSI6eyJlbWFpbCI6InBtb2RlMzA5M0BnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6Im1vZCJ9LCJpc3MiOiJodHRwczovL2F1dGgub3BlbmFpLmNvbSIsInB3ZF9hdXRoX3RpbWUiOjE3ODQ5ODYwNzcxOTcsInNjcCI6WyJvcGVuaWQiLCJlbWFpbCIsInByb2ZpbGUiLCJvZmZsaW5lX2FjY2VzcyIsIm1vZGVsLnJlcXVlc3QiLCJtb2RlbC5yZWFkIiwib3JnYW5pemF0aW9uLnJlYWQiLCJvcmdhbml6YXRpb24ud3JpdGUiXSwic2Vzc2lvbl9pZCI6ImF1dGhzZXNzX0FVczk1QVQ1VUV3VlV6OTlTYjc4bU9DMyIsInNsIjp0cnVlLCJzdWIiOiJhdXRoMHwycTEwMWJvZjZES0RwdkN6QXN4ZHRaU1giLCJpYXQiOjE3ODQ5ODYwNzgsImV4cCI6MTc4NTg1MDA3OCwianRpIjoiZmJlYzgzYWViZGFkNGIxNTk2ZDNjNjQ3MTdmNzQ5MjgiLCJuYmYiOjE3ODQ5ODYwNzh9.ZcHydcr6uSnUMsgDfXBvpi4SVll0I7RkhfoHLhIoXOjJUT7EkhPX8L8BAbkjXQWO0hmi-mUQKKrQSD-SOEhawwWoKOkW0_HMhHEYol_p6m4Ue-vSuhi1cWX3fKEQGJJI0iiHPZ9TOwSkwvZE6Ks6OODAPIlQ38iwPRhT5StZ6uKZjvXde2qasEhudyp9RqrocesiaVZdr0t5yaV_aX6ymnpTWgZTPl1GfXXlYzTfzZ_yDRP7Y-nk5yS1386Hwo-4l0cpCIEJ7iRySHVU0ngVAr_znWwmvq_bjlOJl2edTRgT6JKSgbUSJj-T7QDvKnE4vvwIFL_REQoqvZi21_bMaw',
            'accept': 'application/json',
            'content-type': 'application/json',
            'sentry-trace': '4dbc0a214163496696cc4853e4c97638-e5e82122f9eb414b',
            'baggage': 'sentry-environment=production,sentry-org_id=33249,sentry-public_key=6884768431e4ba548d58cbf3ad96e4ce,sentry-release=com.openai.chatgpt%401.2026.195%2B2619512,sentry-sample_rand=0.9084910522915798,sentry-trace_id=4dbc0a214163496696cc4853e4c97638',
        }
        
        self.session = requests.Session()
        self.session.cookies.update(self.cookies)
        self.session.headers.update(self.headers)
        
        self.conversation_id = None
        self.turn_trace_id = "5084338c-0811-492b-8c20-098f02da538b"
        self.convo_session_id = "c7e44d5d-97a9-43b6-888a-ac42adfdd69a"
        self.conduit_token = None
        self.messages_history = []
        self.conversations = {}
        self.current_conversation_name = "المحادثة الرئيسية"
        self.conversation_created = False
        
    def create_conversation(self, name: str = None) -> str:
        conversation_id = str(uuid.uuid4())
        if name is None:
            name = f"محادثة {len(self.conversations) + 1}"
        self.conversations[conversation_id] = {
            'name': name,
            'messages': [],
            'created_at': time.time()
        }
        self.conversation_id = conversation_id
        self.messages_history = []
        self.current_conversation_name = name
        self.conduit_token = None
        self.conversation_created = False
        return conversation_id
    
    def switch_conversation(self, conversation_id: str) -> bool:
        if conversation_id in self.conversations:
            self.conversation_id = conversation_id
            self.messages_history = self.conversations[conversation_id]['messages']
            self.current_conversation_name = self.conversations[conversation_id]['name']
            self.conduit_token = None
            self.conversation_created = False
            return True
        return False
    
    def list_conversations(self) -> List[Dict]:
        return [{'id': cid, 'name': data['name'], 'messages_count': len(data['messages'])} 
                for cid, data in self.conversations.items()]
    
    def prepare_conversation(self) -> bool:
        url = f"{self.base_url}/f/conversation/prepare"
        
        json_data = {
            'action': 'next',
            'messages': [],
            'model': 'gpt-5-5',
            'history_and_training_disabled': False,
            'fork_from_shared_post': False,
            'enable_message_followups': False,
            'force_use_sse': False,
            'force_use_search': None,
            'force_paragen': False,
            'supported_encodings': ['v1'],
            'supports_buffering': True,
            'timezone': 'Africa/Cairo',
            'timezone_offset_min': -180,
            'system_hints': [],
            'is_onboarding_conversation': False,
            'client_prepare_dispatch': 'debounced',
            'client_prepare_source': 'composer_editor_state',
        }
        
        try:
            response = self.session.post(url, json=json_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'ok' and 'conduit_token' in data:
                    self.conduit_token = data['conduit_token']
                    self.session.headers['x-conduit-token'] = self.conduit_token
                    return True
            return False
        except Exception:
            return False
    
    def send_message(self, message: str, model: str = "gpt-5-5", stream_callback: Optional[Callable[[str], None]] = None) -> Optional[str]:
        """
        إرسال رسالة والحصول على الرد.
        إذا تم توفير stream_callback، سيتم استدعاؤه مع كل جزء من الرد فور وصوله.
        وإلا فسيتم تجميع الرد وإرجاعه كسلسلة نصية كاملة.
        """
        if not self.conduit_token:
            if not self.prepare_conversation():
                return None
        
        if self.conversation_id not in self.conversations:
            self.create_conversation()
        
        url = f"{self.base_url}/f/conversation"
        
        self.session.headers['accept'] = 'text/event-stream,application/json'
        self.session.headers['cache-control'] = 'no-cache'
        self.session.headers['x-oai-convo-session-id'] = self.convo_session_id
        self.session.headers['x-oai-turn-trace-id'] = self.turn_trace_id
        self.session.headers['x-openai-target-path'] = '/backend-api/f/conversation'
        self.session.headers['x-sentinel-payload'] = '{"bot_token":{"play_integrity_token":"CrACARCnMGsF7j1NwFCca2AxEvmUB5XhPt4xCBWmweZ5C-AR2nJzV_Fkzd0c_MRs3f5T6GfbcGfOG5Dmy3dH9nzD5YvSCpYSh1ojx1s1cgAm_P0PTQnDKNacNNHbv-kQH7fEmlTjvsQNcoW2r42aURGcfQDOtlHd6FGzsMqoM2aqZeB9GV3RHChqgKOqbKA4-0mIXBw-7VEWg8nkNdBf1wiEHChb5cOI2OQ-UuEWmr6NO3SkLx7DuM_0FqIfRUOVUP4gapRl5tul-ppJAIlf-xGX1hW9iqJm4CL50eEGeJ4KOttGlVxsRpc73bfeS_kUhYoEPT0xB7wlPnfeOW5NdBs78mn3S-FDRKf3AC1gqupGGANZbQR6qY2M79PeTlK6omk349vOOuXw77wT4RnmZHaVdxp_AQVQf54nDucyAesYnJtNGJOl8G7rwjF2qgMIrCK_Z5BgOeAk4hFvPaY0SCL6ilqVlYhBCTqJXQbDIw1JP8hPkdv4FOLVb-_flFyaHMPZypQbuB96o1UqL6-jmszlLGI1CFPDxcemXSrmOGAChaz1AzLYCJHPOVR5qXcUmrgUpg","chat_requirement_token":"gAAAAABqaJ2IQsbdGHDM2ztKb_BItiwubWOiTeFItM2yTRVXueUAkNHhUet_XbKyT2kop0xjljTe5_shuU-uPCo3DzsXkPbfItuxU2BfOQFDTLkD0nQQlcaVHRkDleLYp7fLt9mIhkqkLQyzz1E3sFZhhi6vB9uh9LA4eLx05m7qEgXB6fzYae06WwyJQu_Joc--l5EQEhZjMreWIAEC9AlcdNZUFyfBupSwJIlV1NvI2zXp9RMlFgyzVnSmQOtMgIWBUnfANyB1Fjrv3Qi6USEAuAcPkHCSh8mcxrLdNV8z0wSHOgRESlTLoeO-7WURcRoCiN2Mqolw_SAnGAM16kIRvgmTQoI-h_Ga4CC5kpG6HUtjeSRBDwUz3fa0JOuWnHIWbQ0fm50ZPvsNq3QQAdSD3r1nhAZaeQsO3O_2C_VztDRq372cSBaaGLIwDnWHdAGXhCr2iXp3F7VETFvG1CSv5Ic3jza73u5j1jVoFlCvqB0S4ZUprNpJ2QVs5BvSHf5IanNVdOO-8mRFl9uI6uRKhLhBsx9vSHwOVTMA18-xBYyO3oOT3NAQhnfz6ja5dJjs6zKi8tUSpnjeZ7rJsnFf91vhqxwSgcrUNOth26XaeWuXaLE5YzjPxqbIP02eeYMSpYSNiKOIo6N4_56h6lQMtkDxSBItCcyuT_UtOYhQgKMqmce8EwDQ28z5uUuyI91c_vaZnnLbvwt-PVOqh1Xo7q2wNU06jv3jlVMdlOd-0my9xZNEr6ukqKjjj8aTyJoTDml5EKQyXfqKq4MIlY_Iq1Cd_YtuJzX5OwooTj_eoC3c-LFIdjARWq0ioA38dVq--CeQzomhLcdnZ8CrOSj4bj6CW3qTVRboysMr4HxMKZyKR9zc5PERqKHBpbkH4LwWbFAyeSeGyGufZlGxPI1e3rdKlszedz_imuFisn8bPY8dIgGrPNw1KUOd5Ru1TIbzE4L2LWrA6644F_ZnAl8Juer6kHx9iA=="}}'
        
        message_id = str(uuid.uuid4())
        
        messages_to_send = []
        
        for msg in self.messages_history:
            messages_to_send.append({
                'id': msg['id'],
                'author': {'role': msg['role']},
                'content': {'parts': [msg['content']], 'content_type': 'text'},
                'status': 'finished_successfully',
                'recipient': 'all',
                'metadata': {
                    'model_slug': model,
                    'default_model_slug': model,
                    'is_visually_hidden_from_conversation': False,
                    'exclude_after_next_user_message': False,
                    'content_references': [],
                    'search_result_groups': [],
                    'search_queries': [],
                    'image_results': [],
                    'real_time_audio_has_video': False,
                    'system_hints': [],
                    'dictation': False,
                    'voice_mode_message': False,
                    'image_gen_async': False,
                    'trigger_async_ux': False,
                    'writing_blocks': {},
                },
            })
        
        messages_to_send.append({
            'id': message_id,
            'author': {'role': 'user'},
            'content': {'parts': [message], 'content_type': 'text'},
            'status': 'finished_successfully',
            'recipient': 'all',
            'metadata': {
                'model_slug': model,
                'default_model_slug': model,
                'is_visually_hidden_from_conversation': False,
                'exclude_after_next_user_message': False,
                'content_references': [],
                'search_result_groups': [],
                'search_queries': [],
                'image_results': [],
                'real_time_audio_has_video': False,
                'system_hints': [],
                'dictation': False,
                'voice_mode_message': False,
                'image_gen_async': False,
                'trigger_async_ux': False,
                'writing_blocks': {},
            },
        })
        
        json_data = {
            'action': 'next',
            'messages': messages_to_send,
            'model': model,
            'history_and_training_disabled': False,
            'fork_from_shared_post': False,
            'enable_message_followups': True,
            'force_use_sse': True,
            'force_use_search': None,
            'force_paragen': False,
            'supported_encodings': ['v1'],
            'supports_buffering': True,
            'timezone': 'Africa/Cairo',
            'timezone_offset_min': -180,
            'system_hints': [],
            'is_onboarding_conversation': False,
            'client_prepare_state': 'success',
            'stream': True,
        }
        
        if self.conversation_id and self.conversation_created:
            json_data['conversation_id'] = self.conversation_id
        
        try:
            response = self.session.post(url, json=json_data, stream=True)
            
            if response.status_code != 200:
                print(f"❌ خطأ في الإرسال: {response.text}")
                if "conversation_not_found" in response.text:
                    self.conversation_id = None
                    self.conversation_created = False
                    self.conduit_token = None
                    return self.send_message(message, model, stream_callback)
                return None
            
            full_response = ""
            current_event = None
            
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    
                    if line_str.startswith('event: '):
                        current_event = line_str[7:]
                        continue
                    
                    if line_str.startswith('data: '):
                        data_str = line_str[6:]
                        
                        if data_str == '[DONE]':
                            break
                        
                        try:
                            data = json.loads(data_str)
                            
                            if isinstance(data, dict):
                                if 'conversation_id' in data and not self.conversation_created:
                                    if data['conversation_id']:
                                        self.conversation_id = data['conversation_id']
                                        self.conversation_created = True
                                
                                if current_event == 'delta':
                                    chunk = None
                                    # حالة append مباشر
                                    if 'p' in data and 'o' in data:
                                        if data.get('o') == 'append' and data.get('p') == '/message/content/parts/0':
                                            if 'v' in data and isinstance(data['v'], str):
                                                chunk = data['v']
                                    
                                    # حالة patch مع append
                                    elif 'o' in data and data.get('o') == 'patch':
                                        if 'v' in data and isinstance(data['v'], list):
                                            for patch in data['v']:
                                                if patch.get('o') == 'append' and patch.get('p') == '/message/content/parts/0':
                                                    if 'v' in patch and isinstance(patch['v'], str):
                                                        chunk = patch['v']
                                                        break
                                    
                                    # حالة v فقط (نص مباشر) - للاحتياط
                                    elif 'v' in data:
                                        v_data = data['v']
                                        if isinstance(v_data, str) and v_data != "v1":
                                            if not data.get('p'):
                                                chunk = v_data
                                    
                                    if chunk:
                                        full_response += chunk
                                        if stream_callback:
                                            stream_callback(chunk)
                        
                        except json.JSONDecodeError:
                            pass
            
            if full_response:
                self.messages_history.append({
                    'id': message_id,
                    'role': 'user',
                    'content': message,
                    'timestamp': time.time()
                })
                self.messages_history.append({
                    'id': str(uuid.uuid4()),
                    'role': 'assistant',
                    'content': full_response,
                    'timestamp': time.time()
                })
                
                if self.conversation_id in self.conversations:
                    self.conversations[self.conversation_id]['messages'] = self.messages_history
                else:
                    self.conversations[self.conversation_id] = {
                        'name': self.current_conversation_name,
                        'messages': self.messages_history,
                        'created_at': time.time()
                    }
            
            return full_response
        except Exception as e:
            print(f"❌ خطأ: {e}")
            return None
    
    def chat(self, message: str, model: str = "gpt-5-5", stream_callback: Optional[Callable[[str], None]] = None) -> Optional[str]:
        if self.conversation_id is None or self.conversation_id not in self.conversations:
            self.create_conversation()
        
        if not self.conduit_token:
            if not self.prepare_conversation():
                return None
        
        return self.send_message(message, model, stream_callback)
    
    def delete_conversation(self, conversation_id: str) -> bool:
        if conversation_id in self.conversations:
            del self.conversations[conversation_id]
            if self.conversation_id == conversation_id:
                if self.conversations:
                    self.conversation_id = list(self.conversations.keys())[0]
                    self.messages_history = self.conversations[self.conversation_id]['messages']
                    self.current_conversation_name = self.conversations[self.conversation_id]['name']
                else:
                    self.conversation_id = None
                    self.messages_history = []
                    self.current_conversation_name = "المحادثة الرئيسية"
                self.conduit_token = None
                self.conversation_created = False
            return True
        return False
    
    def get_conversation_history(self) -> List[Dict]:
        return self.messages_history
    
    def clear_history(self):
        self.messages_history = []
        if self.conversation_id in self.conversations:
            self.conversations[self.conversation_id]['messages'] = []
        self.conduit_token = None
        self.conversation_created = False

def main():
    client = ChatGPTAndroidClient()
    client.create_conversation("المحادثة الرئيسية")
    
    # متغير للتحكم في وضع البث المباشر
    stream_mode = True  # افتراضي تشغيل البث
    
    print("=" * 60)
    print("ChatGPT Android Client - دعم البث المباشر (Streaming)")
    print("=" * 60)
    print("\nالأوامر:")
    print("  /new [اسم]     - إنشاء محادثة جديدة")
    print("  /list          - عرض قائمة المحادثات")
    print("  /switch [id]   - التبديل إلى محادثة أخرى")
    print("  /delete [id]   - حذف محادثة")
    print("  /history       - عرض تاريخ المحادثة الحالية")
    print("  /clear         - مسح تاريخ المحادثة الحالية")
    print("  /stream        - تبديل وضع البث المباشر (تشغيل/إيقاف)")
    print("  /exit          - الخروج")
    print("-" * 60)
    print(f"وضع البث المباشر: {'✅ مفعل' if stream_mode else '❌ معطل'}")
    
    while True:
        print(f"\n[المحادثة: {client.current_conversation_name}]")
        user_input = input("أنت: ")
        
        if user_input.lower() == '/exit':
            break
        
        if user_input.startswith('/'):
            parts = user_input.split(' ', 1)
            cmd = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else None
            
            if cmd == '/new':
                name = arg if arg else f"محادثة {len(client.conversations) + 1}"
                client.create_conversation(name)
                print(f"✅ تم إنشاء محادثة جديدة: {name}")
                continue
            
            elif cmd == '/list':
                convs = client.list_conversations()
                if convs:
                    print("\n📋 قائمة المحادثات:")
                    for conv in convs:
                        current = " 🔵" if conv['id'] == client.conversation_id else ""
                        print(f"  {conv['id'][:8]}... | {conv['name']} | {conv['messages_count']} رسائل{current}")
                else:
                    print("❌ لا توجد محادثات")
                continue
            
            elif cmd == '/switch':
                if arg:
                    if client.switch_conversation(arg):
                        print(f"✅ تم التبديل إلى: {client.current_conversation_name}")
                    else:
                        print("❌ المحادثة غير موجودة")
                else:
                    print("⚠️ يرجى تحديد معرف المحادثة")
                continue
            
            elif cmd == '/delete':
                if arg:
                    if client.delete_conversation(arg):
                        print("✅ تم حذف المحادثة")
                    else:
                        print("❌ المحادثة غير موجودة")
                else:
                    print("⚠️ يرجى تحديد معرف المحادثة")
                continue
            
            elif cmd == '/history':
                history = client.get_conversation_history()
                if history:
                    print("\n📜 تاريخ المحادثة:")
                    for msg in history:
                        role = "👤 أنت" if msg['role'] == 'user' else "🤖 ChatGPT"
                        print(f"{role}: {msg['content'][:100]}{'...' if len(msg['content']) > 100 else ''}")
                else:
                    print("📭 لا توجد رسائل في هذه المحادثة")
                continue
            
            elif cmd == '/clear':
                client.clear_history()
                print("✅ تم مسح تاريخ المحادثة")
                continue
            
            elif cmd == '/stream':
                stream_mode = not stream_mode
                print(f"✅ تم {'تفعيل' if stream_mode else 'إيقاف'} وضع البث المباشر")
                continue
            
            else:
                print(f"⚠️ أمر غير معروف: {cmd}")
                continue
        
        if not user_input.strip():
            continue
        
        print("⏳ جاري الرد...")
        if stream_mode:
            # وضع البث المباشر: طباعة النص فور وصوله
            print("🤖 ChatGPT: ", end="", flush=True)
            full_response = client.chat(user_input, stream_callback=lambda chunk: print(chunk, end="", flush=True))
            print()  # سطر جديد بعد انتهاء الرد
            if not full_response:
                print("\n❌ حدث خطأ في الاتصال")
        else:
            # وضع التجميع الكامل
            response = client.chat(user_input)
            if response:
                print(f"\n🤖 ChatGPT: {response}")
            else:
                print("\n❌ حدث خطأ في الاتصال")

if __name__ == "__main__":
    main()