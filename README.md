# MG-POS

MG-POS: aplikasi kasir, stok, dan kas untuk banyak toko dalam satu aplikasi. Awalnya dibuat untuk Naeema Hijab.

## Fitur

- **Banyak bisnis**: setiap bisnis mendaftar di `/daftar` dan mendapat **kode toko** (mis. `naeema`).
  Semua data (produk, stok, penjualan, kas, QR, pengaturan) terpisah per bisnis; pengguna hanya bisa melihat
  data bisnisnya sendiri. Saat masuk di perangkat baru, isi kode toko dulu, lalu pilih nama dan PIN.
  Tautan langsung: `/login?toko=kode-toko`. Kategori produk dan nama bisnis diatur sendiri di Pengaturan.
- **Admin MG-POS** (`/admin/login`, terpisah dari halaman dan akun toko): akun admin sendiri dengan nama + PIN.
  Atur mode pendaftaran (terbuka, perlu persetujuan, kode undangan, ditutup), setujui/tolak pendaftaran, buat toko,
  nonaktifkan toko, ganti nama/logo toko, kelola akun di toko mana pun, dan kelola akun admin lain.
  Admin pertama diambil dari admin platform lama dengan nama dan PIN yang sama. Di instalasi baru,
  `/admin/login` meminta membuat admin pertama.
- **Logo**: logo MG-POS untuk ikon aplikasi. Logo toko wajib diunggah saat daftar (PNG/JPG/WEBP, maks. 512 KB),
  tampil di halaman masuk, menu atas, dan di atas struk (cetak browser maupun printer Bluetooth, diubah jadi hitam-putih).
- **Kasir**: penjualan dari toko offline, marketplace (Shopee, Tokopedia, TikTok Shop, Lazada), atau pameran/event.
  Mata uang IDR (default), MYR, SGD. Kurs ke IDR dikunci di setiap nota. Setiap pembayaran dicatat masuk ke dompet siapa.
- **Produk & stok**: produk per kategori, varian warna/ukuran, harga IDR + harga resmi MYR/SGD.
  Stok per lokasi (gudang, toko, booth pameran), barang masuk, pindah lokasi, stock opname, riwayat mutasi.
- **Event**: nama, kota, negara, tanggal, mata uang. Lokasi stok booth dibuat otomatis.
  Laporan event: penjualan, pengeluaran, stok dibawa/terjual/sisa, uang masuk ke siapa, pengembalian sisa stok.
- **Kas per orang**: saldo tiap dompet (orang, rekening, saldo marketplace) per mata uang.
  Setoran dan serah terima uang menunggu konfirmasi penerima; pengeluaran dan tukar valas dicatat dengan kurs sebenarnya.
- **Laporan**: penjualan per sumber, marketplace, event, mata uang, kategori, kasir; rekonsiliasi uang per orang;
  produk terlaris; unduh CSV penjualan.
- **Peran & login**: setiap orang masuk dengan nama + PIN (4-8 angka, disimpan sebagai hash).
  Akun dikunci 15 menit setelah 5 PIN salah. Owner/Admin melihat semua dan bisa mengganti PIN orang lain;
  Staf hanya input penjualan dan mengelola dompetnya sendiri.
- **QR pembayaran**: simpan gambar QR statis (QRIS, Touch 'n Go, DuitNow, PayNow, dll.) di Pengaturan,
  masing-masing terhubung ke dompet/rekening penerima. Di kasir, tombol "Bayar pakai QR" menampilkan QR layar penuh
  beserta nominalnya (hanya QR yang sesuai mata uang penjualan), lalu mencatat uangnya masuk ke dompet QR tersebut.
- **Cetak struk thermal** (58 mm atau 80 mm, kop toko diatur di Pengaturan):
  - *Cetak*: lewat dialog cetak browser, untuk printer yang terpasang di laptop/HP (USB, atau Bluetooth lewat aplikasi seperti RawBT di Android).
  - *Cetak ke printer Bluetooth*: kirim perintah ESC/POS langsung dari Chrome (Android/laptop) lewat Web Bluetooth. Tidak didukung Safari/iPhone.
  - Opsi di kasir untuk langsung membuka struk setelah menyimpan penjualan.
- **Zona waktu**: semua tanggal memakai WIB (Asia/Jakarta), walaupun server berjalan dalam UTC.

## Online di Vercel + Neon (Postgres)

1. Daftar di vercel.com dengan akun GitHub.
2. **Add New → Project**, pilih repo `naeema`, klik **Import** (pengaturan bawaan sudah benar).
3. Di project Vercel, tab **Storage → Create Database → Neon**, sambungkan ke project ini.
   Variabel `DATABASE_URL` dan `DATABASE_URL_UNPOOLED` terisi otomatis.
4. **Deploy** (atau Redeploy jika sudah sempat deploy sebelum database tersambung).
   Proses build otomatis membuat tabel di database (`prisma migrate deploy`).
5. Buka `/daftar` di link aplikasinya untuk mendaftarkan bisnis pertama (nama bisnis, kode toko, nama owner, PIN).
   Setelah itu isi kategori, kurs, tim, dompet, produk, dan stok dari menu Pengaturan/Produk/Stok.
   Data yang sudah ada sebelum fitur banyak bisnis otomatis menjadi bisnis "Naeema Hijab" dengan kode toko `naeema`.

## Menjalankan di komputer

Butuh Node.js 20+ dan Postgres.

```bash
npm install
cp .env.example .env        # sesuaikan alamat Postgres
npx prisma migrate deploy
npm run db:seed             # bisnis contoh, kode toko "contoh", semua akun PIN 1234 (jangan di database asli)
npm run dev                 # buka http://localhost:3000
```

Tes logika inti memakai database terpisah yang isinya dihapus setiap kali tes berjalan:
`TEST_DATABASE_URL=postgresql://... npm test`.

## Cara uang dihitung

Semua nilai disimpan dalam satuan terkecil (rupiah, sen). Saldo dompet =
uang dari penjualan + uang masuk terkonfirmasi − uang keluar terkonfirmasi.
Setoran yang belum dikonfirmasi tampil terpisah dan belum mengurangi saldo.

## Belum ada di versi ini

- Mode offline penuh untuk booth tanpa internet.
- Impor pesanan marketplace dari file CSV/Excel dan sinkron stok otomatis.
