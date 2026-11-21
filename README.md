# Naeema POS

Aplikasi kasir, stok, dan kas untuk Naeema. Versi pertama (uji coba).

## Fitur

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
- **Zona waktu**: semua tanggal memakai WIB (Asia/Jakarta), walaupun server berjalan dalam UTC.

## Online di Vercel + Neon (Postgres)

1. Daftar di vercel.com dengan akun GitHub.
2. **Add New → Project**, pilih repo `naeema`, klik **Import** (pengaturan bawaan sudah benar).
3. Di project Vercel, tab **Storage → Create Database → Neon**, sambungkan ke project ini.
   Variabel `DATABASE_URL` dan `DATABASE_URL_UNPOOLED` terisi otomatis.
4. **Deploy** (atau Redeploy jika sudah sempat deploy sebelum database tersambung).
   Proses build otomatis membuat tabel di database (`prisma migrate deploy`).
5. Buka link aplikasinya. Karena database masih kosong, halaman pertama meminta membuat **akun owner**
   (nama + PIN). Setelah itu isi kurs, tim, dompet, produk, dan stok dari menu Pengaturan/Produk/Stok.

## Menjalankan di komputer

Butuh Node.js 20+ dan Postgres.

```bash
npm install
cp .env.example .env        # sesuaikan alamat Postgres
npx prisma migrate deploy
npm run db:seed             # data contoh, semua akun PIN 1234 (opsional, jangan di database asli)
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
- Cetak struk.
