## 查询歌曲播放地址

GET https://api.chksz.top/api/163_music?id=1315196858&level=lossless
{
code: 200,
msg: "success",
data: {
id: 1315196858,
url: "https://m701.music.126.net/20260428202510/46ad986e3513b59105e1a8be1dcfc2fd/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/62737398660/2586/d7be/434f/7e7f73e170dd7c6ca18132cc8a6adfe8.flac?vuutv=qtYBmkUV49XOOFl+QTMu2EwU7KNkAWXQ9LxngHHkCbeUPuiSNXfzsgxZqI0ajeCjnT/1uFmv6jedWFoS7GUcvH+HRywBOEcnAUMU16YgrDI=",
br: 870193,
level: "lossless",
size: 19864366,
md5: "7e7f73e170dd7c6ca18132cc8a6adfe8",
name: "涧（Original Mix）",
artist: "wilemeyufis",
album: "涧（Original Mix）",
picUrl: "https://p4.music.126.net/VU-kDn5yQyzqKnavs3oE8Q==/109951163585297091.jpg"
}
}

## 查询歌词详情

GET https://api.chksz.top/api/163_lyric?id=1315196858
{

    "code": 200,
    "msg": "success",
    "data": {
        "lrc": "[00:00.00] 作曲 : 柏林护士...",
        "tlyric": "...",
        "romalrc": "...",
        "klyric": ""
    }

}

## 查询歌单详情

https://api.chksz.top/api/163_playlist?id=5202687076
{
"data": {
"id": 5202687076,
"name": "歌单名称",
"coverImgUrl": "https://p1.music.126.net/...",
"trackCount": 100,
"creator": {
"nickname": "创建者昵称",
...
},
"tracks": [
{
"id": 123456,
"name": "歌曲名称",
"ar": [
{ "name": "歌手" }
],
"al": {
"name": "专辑",
"picUrl": "..."
}
},
...
]
}
}

## 搜索歌曲

GET https://api.chksz.top/api/163_search?keyword=陈奕迅&limit=3&&offset=0
{
code: 200,
msg: "success",
data: {
songs: [
{
id: 109998,
name: "贝加尔湖畔",
artists: "李健",
album: "依然",
picUrl: "http://p3.music.126.net/vSdrZFQn3uMetLL_j3AnQg==/109951163432562414.jpg",
duration: 245600
}
],
total: 297
}
}
